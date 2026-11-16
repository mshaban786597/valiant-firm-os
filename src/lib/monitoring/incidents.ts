import { IncidentSeverity, IncidentStatus, type Monitor } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { buildFingerprint, defaultSeverity } from "@/lib/monitoring/fingerprint";

export interface CheckResult {
  status: "ok" | "fail";
  statusCode?: number | null;
  latencyMs?: number | null;
  detail?: string | null;
  /** What was affected, for fingerprinting (e.g. the URL or route). */
  affectedObject?: string;
  /** Check kind, for fingerprinting (e.g. "uptime", "lead_route"). */
  checkKind?: string;
}

export interface RecordResult {
  checkId: string;
  incidentId: string | null;
  action: "none" | "incident_opened" | "incident_occurrence" | "incident_resolved";
}

type MonitorLike = Pick<
  Monitor,
  "id" | "organizationId" | "clientId" | "name" | "type" | "target"
>;

/**
 * Record a monitor check result and drive the incident lifecycle:
 *  - persist the check + update the monitor's last status
 *  - on failure: open a deduplicated incident (one per fingerprint), or add an
 *    occurrence to the existing open one; create a single delivery task + a
 *    founder alert for critical/first occurrences
 *  - on success: resolve the open incident for that fingerprint, if any
 *
 * Idempotent on repeated failures: the same failure folds into one incident.
 */
export async function recordCheckResult(
  monitor: MonitorLike,
  result: CheckResult,
): Promise<RecordResult> {
  const check = await prisma.monitorCheck.create({
    data: {
      organizationId: monitor.organizationId,
      monitorId: monitor.id,
      status: result.status,
      statusCode: result.statusCode ?? null,
      latencyMs: result.latencyMs ?? null,
      detail: result.detail ?? null,
    },
  });

  await prisma.monitor.update({
    where: { id: monitor.id },
    data: { lastCheckAt: new Date(), lastStatus: result.status },
  });

  const fingerprint = buildFingerprint(
    monitor.id,
    result.checkKind ?? monitor.type.toLowerCase(),
    result.affectedObject ?? monitor.target,
  );

  if (result.status === "fail") {
    const open = await prisma.incident.findFirst({
      where: {
        organizationId: monitor.organizationId,
        fingerprint,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] },
      },
      select: { id: true },
    });

    if (open) {
      // Repeat failure → fold into the existing incident.
      await prisma.incident.update({
        where: { id: open.id },
        data: { occurrenceCount: { increment: 1 }, lastSeenAt: new Date() },
      });
      await prisma.incidentEvent.create({
        data: {
          incidentId: open.id,
          type: "occurrence",
          note: result.detail ?? `Repeat failure on ${monitor.target}`,
        },
      });
      return { checkId: check.id, incidentId: open.id, action: "incident_occurrence" };
    }

    // New incident.
    const severity = defaultSeverity(monitor.type);
    const incident = await prisma.incident.create({
      data: {
        organizationId: monitor.organizationId,
        monitorId: monitor.id,
        clientId: monitor.clientId,
        fingerprint,
        title: `${monitor.name}: ${result.detail ?? "check failed"}`,
        severity,
        status: IncidentStatus.OPEN,
        evidence: {
          target: monitor.target,
          statusCode: result.statusCode ?? null,
          latencyMs: result.latencyMs ?? null,
          observedAt: new Date().toISOString(),
        },
      },
    });
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
          description: `Automated incident from monitor "${monitor.name}" (${monitor.target}). ${result.detail ?? ""}`,
          serviceType: "Monitoring",
          priority: severity === IncidentSeverity.CRITICAL ? "Critical" : "High",
        },
      });
      await prisma.incident.update({ where: { id: incident.id }, data: { taskId: task.id } });
      await prisma.incidentEvent.create({
        data: { incidentId: incident.id, type: "task_created", note: task.id },
      });
    }

    // Founder alert for critical incidents.
    if (severity === IncidentSeverity.CRITICAL) {
      await prisma.founderAlert
        .create({
          data: {
            organizationId: monitor.organizationId,
            clientId: monitor.clientId,
            title: `Critical: ${monitor.name} down`,
            body: `${monitor.target} — ${result.detail ?? "check failed"}`,
            severity: "critical",
          },
        })
        .catch(() => {});
    }

    await writeAuditLog({
      organizationId: monitor.organizationId,
      action: "incident.open",
      entity: "Incident",
      entityId: incident.id,
      meta: { monitorId: monitor.id, severity },
    });

    return { checkId: check.id, incidentId: incident.id, action: "incident_opened" };
  }

  // Success → auto-resolve any open incident for this fingerprint.
  const open = await prisma.incident.findFirst({
    where: {
      organizationId: monitor.organizationId,
      fingerprint,
      status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] },
    },
    select: { id: true },
  });
  if (open) {
    await prisma.incident.update({
      where: { id: open.id },
      data: { status: IncidentStatus.RESOLVED, resolvedAt: new Date() },
    });
    await prisma.incidentEvent.create({
      data: { incidentId: open.id, type: "resolved", note: "Recovery check passed" },
    });
    await writeAuditLog({
      organizationId: monitor.organizationId,
      action: "incident.resolve",
      entity: "Incident",
      entityId: open.id,
    });
    return { checkId: check.id, incidentId: open.id, action: "incident_resolved" };
  }

  return { checkId: check.id, incidentId: null, action: "none" };
}
