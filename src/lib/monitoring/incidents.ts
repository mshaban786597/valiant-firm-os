import { IncidentSeverity, IncidentStatus, Prisma, TaskStatus, type Monitor } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { buildFingerprint, defaultSeverity } from "@/lib/monitoring/fingerprint";
import { notify } from "@/lib/notifications/dispatch";
import type { RecordAction } from "@/lib/monitoring/state";

export interface CheckResult {
  /** "unknown" = the probe itself could not measure (never opens/resolves incidents). */
  status: "ok" | "fail" | "unknown";
  statusCode?: number | null;
  latencyMs?: number | null;
  detail?: string | null;
  /** What was affected, for fingerprinting (e.g. the URL or route). */
  affectedObject?: string;
  /** Check kind, for fingerprinting (e.g. "uptime", "lead_route"). */
  checkKind?: string;
  /** Check-specific memory persisted on the monitor (e.g. content hash). */
  state?: Record<string, unknown>;
}

/**
 * How the observation came about:
 *  - scheduled  the cron tick, when the check was due
 *  - manual     an operator ran a check that was due
 *  - retry      a re-run inside the same check window (not a fresh observation)
 *  - simulated  a forced result on a fixture monitor (demo scope only)
 */
export type CheckTrigger = "scheduled" | "manual" | "retry" | "simulated";

export interface RecordResult {
  checkId: string;
  incidentId: string | null;
  action: RecordAction;
  observedAt: Date;
  consecutiveFailures: number;
  confirmAfter: number;
}

type MonitorLike = Pick<Monitor, "id" | "organizationId" | "clientId" | "name" | "type" | "target"> &
  Partial<
    Pick<
      Monitor,
      "isDemo" | "environment" | "confirmAfter" | "consecutiveFailures" | "maintenanceUntil" | "owner"
    >
  >;

const OPEN = [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED];

/**
 * Record a monitor check result and drive the incident lifecycle.
 *
 *  - every observation is persisted with its trigger
 *  - a failure opens an incident only once `confirmAfter` consecutive fresh
 *    failures are seen, and never during a maintenance window
 *  - incidents are deduplicated by (tenant, monitor, check kind, target); a
 *    partial unique index backs this up under concurrency
 *  - a retry inside the same check window is recorded but is not a new occurrence
 *  - a pass resolves the open incident, turns its alert into history and moves
 *    the linked task to QA for closure
 *
 * Re-running an unchanged check therefore never creates a second incident,
 * task or notification.
 */
export async function recordCheckResult(
  monitor: MonitorLike,
  result: CheckResult,
  options: { trigger?: CheckTrigger } = {},
): Promise<RecordResult> {
  const trigger = options.trigger ?? "scheduled";
  const isDemo = monitor.isDemo ?? false;
  const environment = monitor.environment ?? "production";
  const confirmAfter = Math.max(1, monitor.confirmAfter ?? 1);
  const previousFailures = monitor.consecutiveFailures ?? 0;
  const observedAt = new Date();

  let consecutiveFailures = previousFailures;
  if (result.status === "ok") consecutiveFailures = 0;
  else if (result.status === "fail" && trigger !== "retry") consecutiveFailures = previousFailures + 1;

  const check = await prisma.monitorCheck.create({
    data: {
      organizationId: monitor.organizationId,
      monitorId: monitor.id,
      status: result.status,
      statusCode: result.statusCode ?? null,
      latencyMs: result.latencyMs ?? null,
      detail: result.detail ?? null,
      trigger,
      observedAt,
    },
  });

  await prisma.monitor.update({
    where: { id: monitor.id },
    data: {
      lastCheckAt: observedAt,
      lastStatus: result.status,
      consecutiveFailures,
      ...(result.state ? { state: result.state as Prisma.InputJsonValue } : {}),
    },
  });

  const base = { checkId: check.id, observedAt, consecutiveFailures, confirmAfter };
  if (result.status === "unknown") return { ...base, incidentId: null, action: "none" };

  const fingerprint = buildFingerprint(
    monitor.id,
    result.checkKind ?? monitor.type.toLowerCase(),
    result.affectedObject ?? monitor.target,
  );
  const findOpen = () =>
    prisma.incident.findFirst({
      where: { organizationId: monitor.organizationId, fingerprint, status: { in: OPEN } },
      select: { id: true, taskId: true },
    });

  if (result.status === "fail") {
    const open = await findOpen();

    if (open) {
      if (trigger === "retry") {
        await prisma.incidentEvent.create({
          data: { incidentId: open.id, type: "retry", note: result.detail ?? "Retry still failing" },
        });
        return { ...base, incidentId: open.id, action: "incident_retry" };
      }
      await prisma.incident.update({
        where: { id: open.id },
        data: { occurrenceCount: { increment: 1 }, lastSeenAt: observedAt },
      });
      await prisma.incidentEvent.create({
        data: {
          incidentId: open.id,
          type: "occurrence",
          note: result.detail ?? `Repeat failure on ${monitor.target}`,
        },
      });
      return { ...base, incidentId: open.id, action: "incident_occurrence" };
    }

    if (monitor.maintenanceUntil && monitor.maintenanceUntil.getTime() > observedAt.getTime()) {
      return { ...base, incidentId: null, action: "maintenance" };
    }
    if (consecutiveFailures < confirmAfter) {
      return { ...base, incidentId: null, action: "failure_unconfirmed" };
    }

    // New confirmed incident.
    const severity = defaultSeverity(monitor.type);
    let incident: { id: string };
    try {
      incident = await prisma.incident.create({
        data: {
          organizationId: monitor.organizationId,
          monitorId: monitor.id,
          clientId: monitor.clientId,
          fingerprint,
          title: `${monitor.name}: ${result.detail ?? "check failed"}`,
          severity,
          status: IncidentStatus.OPEN,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
          isDemo,
          environment,
          evidence: {
            target: monitor.target,
            environment,
            statusCode: result.statusCode ?? null,
            latencyMs: result.latencyMs ?? null,
            observedAt: observedAt.toISOString(),
            checkId: check.id,
            trigger,
            confirmedAfter: confirmAfter,
          },
        },
      });
    } catch (err) {
      // A concurrent writer opened the same incident first (unique open fingerprint).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await findOpen();
        if (winner) {
          await prisma.incident.update({
            where: { id: winner.id },
            data: { occurrenceCount: { increment: 1 }, lastSeenAt: observedAt },
          });
          return { ...base, incidentId: winner.id, action: "incident_occurrence" };
        }
      }
      throw err;
    }
    await prisma.incidentEvent.create({
      data: { incidentId: incident.id, type: "opened", note: result.detail ?? null },
    });

    // One delivery task per incident (only when a client owns the monitor).
    if (monitor.clientId) {
      const task = await prisma.task.create({
        data: {
          organizationId: monitor.organizationId,
          clientId: monitor.clientId,
          title: `Investigate: ${monitor.name}`,
          description:
            `Automated incident from monitor "${monitor.name}" (${monitor.target}, ${environment}). ` +
            `${result.detail ?? ""}\nEvidence: check ${check.id} at ${observedAt.toISOString()}.`,
          serviceType: "Monitoring",
          owner: monitor.owner ?? null,
          priority: severity === IncidentSeverity.CRITICAL ? "Critical" : "High",
          isDemo,
        },
      });
      await prisma.incident.update({ where: { id: incident.id }, data: { taskId: task.id } });
      await prisma.incidentEvent.create({
        data: { incidentId: incident.id, type: "task_created", note: task.id },
      });
    }

    // Founder alert for critical incidents, linked so it clears on recovery.
    if (severity === IncidentSeverity.CRITICAL) {
      await prisma.founderAlert
        .create({
          data: {
            organizationId: monitor.organizationId,
            clientId: monitor.clientId,
            incidentId: incident.id,
            title: `Critical: ${monitor.name} down`,
            body: `${monitor.target} — ${result.detail ?? "check failed"}`,
            severity: "critical",
            isDemo,
          },
        })
        .catch(() => {});
    }

    await writeAuditLog({
      organizationId: monitor.organizationId,
      action: "incident.open",
      entity: "Incident",
      entityId: incident.id,
      meta: { monitorId: monitor.id, severity, environment, isDemo },
    });

    await notify({
      organizationId: monitor.organizationId,
      event: "incident_opened",
      title: `${monitor.name} — ${result.detail ?? "check failed"}`,
      body: `Site: ${monitor.target}\nEnvironment: ${environment}\nSeverity: ${severity}`,
      severity:
        severity === IncidentSeverity.CRITICAL
          ? "critical"
          : severity === IncidentSeverity.WARNING
            ? "warning"
            : "info",
      path: "/monitoring",
      isDemo,
    }).catch(() => []);

    return { ...base, incidentId: incident.id, action: "incident_opened" };
  }

  // Pass → resolve the open incident for this fingerprint, if any.
  const open = await findOpen();
  if (!open) return { ...base, incidentId: null, action: "none" };

  await prisma.incident.update({
    where: { id: open.id },
    data: { status: IncidentStatus.RESOLVED, resolvedAt: observedAt },
  });
  await prisma.incidentEvent.create({
    data: { incidentId: open.id, type: "resolved", note: result.detail ?? "Recovery check passed" },
  });
  // The alert becomes history; the task moves to QA so a person confirms and closes it.
  await prisma.founderAlert.updateMany({
    where: { incidentId: open.id, resolvedAt: null },
    data: { resolvedAt: observedAt },
  });
  if (open.taskId) {
    await prisma.task.updateMany({
      where: { id: open.taskId, status: { in: [TaskStatus.Backlog, TaskStatus.InProgress] } },
      data: { status: TaskStatus.QA },
    });
  }
  await writeAuditLog({
    organizationId: monitor.organizationId,
    action: "incident.resolve",
    entity: "Incident",
    entityId: open.id,
  });
  await notify({
    organizationId: monitor.organizationId,
    event: "incident_resolved",
    title: `${monitor.name} recovered`,
    body: `Site: ${monitor.target}\n${result.detail ?? ""}`,
    path: "/monitoring",
    isDemo,
  }).catch(() => []);

  return { ...base, incidentId: open.id, action: "incident_resolved" };
}
