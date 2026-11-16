import { ApprovalStatus, IncidentStatus, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

/**
 * Incident report built only from persisted records: the monitor's
 * observations, the incident timeline and the approved change. Every figure
 * carries its source and date window. Each rebuild is a new version.
 */
export interface IncidentReportEvidence {
  source: string;
  site: string;
  environment: string;
  period: { from: string; to: string };
  lastObservationAt: string | null;
  observations: { total: number; passed: number; failed: number; unmeasured: number };
  incident: {
    id: string;
    status: string;
    severity: string;
    occurrences: number;
    firstSeenAt: string;
    resolvedAt: string | null;
    minutesToResolve: number | null;
  };
  approvedChanges: {
    approvalId: string;
    title: string;
    status: string;
    executionStatus: string;
    verificationStatus: string;
    decidedAt: string | null;
  }[];
  outcome: string;
  outstanding: string[];
}

export async function buildIncidentReport(input: {
  organizationId: string;
  incidentId: string;
  userId?: string | null;
}): Promise<{ ok: true; reportId: string; version: number } | { ok: false; reason: string }> {
  const incident = await prisma.incident.findFirst({
    where: { id: input.incidentId, organizationId: input.organizationId },
    include: { monitor: true },
  });
  if (!incident) return { ok: false, reason: "Incident not found" };
  if (!incident.clientId) return { ok: false, reason: "The incident's check is not linked to a client" };

  const to = incident.resolvedAt ?? new Date();
  const [checks, changes, task, previous] = await Promise.all([
    incident.monitorId
      ? prisma.monitorCheck.findMany({
          where: { monitorId: incident.monitorId, observedAt: { gte: incident.firstSeenAt, lte: to } },
          select: { status: true, observedAt: true },
          orderBy: { observedAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.approvalRequest.findMany({
      where: { organizationId: input.organizationId, incidentId: incident.id, kind: "fix" },
      orderBy: { createdAt: "asc" },
    }),
    incident.taskId
      ? prisma.task.findUnique({ where: { id: incident.taskId }, select: { title: true, status: true } })
      : Promise.resolve(null),
    prisma.report.findFirst({
      where: { organizationId: input.organizationId, incidentId: incident.id, kind: "incident" },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  const resolved = incident.status === IncidentStatus.RESOLVED;
  const outstanding: string[] = [];
  if (!resolved) outstanding.push("Incident is still open");
  if (task && task.status !== "Completed") outstanding.push(`Task "${task.title}" is ${task.status}, not closed`);
  const approved = changes.filter((c) => c.status === ApprovalStatus.APPROVED);
  if (approved.some((c) => c.verificationStatus !== "passed")) {
    outstanding.push("An approved change has not passed verification");
  }

  const evidence: IncidentReportEvidence = {
    source: "Valiant Agency OS monitor observations (MonitorCheck) and incident timeline",
    site: incident.monitor?.target ?? "unknown",
    environment: incident.environment,
    period: { from: incident.firstSeenAt.toISOString(), to: to.toISOString() },
    lastObservationAt: checks.length ? checks[checks.length - 1]!.observedAt.toISOString() : null,
    observations: {
      total: checks.length,
      passed: checks.filter((c) => c.status === "ok").length,
      failed: checks.filter((c) => c.status === "fail").length,
      unmeasured: checks.filter((c) => c.status === "unknown").length,
    },
    incident: {
      id: incident.id,
      status: incident.status,
      severity: incident.severity,
      occurrences: incident.occurrenceCount,
      firstSeenAt: incident.firstSeenAt.toISOString(),
      resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
      minutesToResolve: incident.resolvedAt
        ? Math.round((incident.resolvedAt.getTime() - incident.firstSeenAt.getTime()) / 60_000)
        : null,
    },
    approvedChanges: approved.map((c) => ({
      approvalId: c.id,
      title: c.title,
      status: c.status,
      executionStatus: c.executionStatus,
      verificationStatus: c.verificationStatus,
      decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
    })),
    outcome: resolved
      ? `Resolved after ${incident.occurrenceCount} recorded failure(s); the original check passes again.`
      : "Not resolved yet.",
    outstanding,
  };

  const version = (previous?.version ?? 0) + 1;
  const summary = [
    `${incident.title}`,
    `Site ${evidence.site} (${evidence.environment}). Window ${evidence.period.from} → ${evidence.period.to}.`,
    `${evidence.observations.total} observations: ${evidence.observations.failed} failed, ${evidence.observations.passed} passed.`,
    evidence.outcome,
    approved.length ? `Approved change: ${approved.map((c) => c.title).join("; ")}.` : "No approved change on record.",
    outstanding.length ? `Outstanding: ${outstanding.join("; ")}.` : "No outstanding work.",
  ].join("\n");

  const report = await prisma.report.create({
    data: {
      organizationId: input.organizationId,
      clientId: incident.clientId,
      month: to.toISOString().slice(0, 7),
      kind: "incident",
      version,
      incidentId: incident.id,
      approvalId: approved.length ? approved[approved.length - 1]!.id : null,
      issuesFixed: resolved ? 1 : 0,
      reportSummary: summary,
      nextMonthPlan: outstanding.length ? outstanding.join("\n") : null,
      evidence: evidence as unknown as object,
      status: ReportStatus.Draft,
      isDemo: incident.isDemo,
    },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "report.incident_built",
    entity: "Report",
    entityId: report.id,
    meta: { incidentId: incident.id, version },
  });
  return { ok: true, reportId: report.id, version };
}

/**
 * Gate for client-facing status. A report may only be marked client-ready when
 * it is the latest version, has evidence, and its change was approved (still
 * valid when executed) and verified.
 */
export async function releaseReportToClient(input: {
  organizationId: string;
  reportId: string;
  userId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const report = await prisma.report.findFirst({
    where: { id: input.reportId, organizationId: input.organizationId },
  });
  if (!report) return { ok: false, reason: "Report not found" };

  const deny = async (reason: string) => {
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: input.userId,
      action: "report.release_denied",
      entity: "Report",
      entityId: report.id,
      meta: { reason },
    });
    return { ok: false as const, reason };
  };

  if (report.kind === "incident") {
    const latest = await prisma.report.findFirst({
      where: { organizationId: input.organizationId, incidentId: report.incidentId, kind: "incident" },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });
    if (latest && latest.id !== report.id) {
      return deny(`A newer version (v${latest.version}) exists; release that one instead`);
    }
    const ev = report.evidence as { source?: string; period?: unknown; outstanding?: string[] } | null;
    if (!ev || !ev.source || !ev.period) return deny("Report has no source evidence");
    if (!report.approvalId) return deny("No approved change is linked to this report");
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: report.approvalId, organizationId: input.organizationId },
    });
    if (!approval || approval.status !== ApprovalStatus.APPROVED) return deny("The linked change is not approved");
    if (approval.verificationStatus !== "passed") return deny("The linked change has not passed verification");
    if (ev.outstanding && ev.outstanding.length) {
      return deny(`Outstanding work remains: ${ev.outstanding.join("; ")}`);
    }
  }

  await prisma.report.update({
    where: { id: report.id },
    data: { clientFacing: true, status: ReportStatus.QA },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "report.client_ready",
    entity: "Report",
    entityId: report.id,
    meta: { version: report.version },
  });
  return { ok: true };
}
