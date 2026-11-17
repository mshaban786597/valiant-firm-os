import { IncidentStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { ReconcileStrip } from "@/components/monitoring/reconcile-strip";
import {
  MonitoringWorkspace,
  type IncidentRow,
  type MonitorRow,
} from "@/components/monitoring/monitoring-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";
import { getMonitoringSummary } from "@/lib/monitoring/summary";
import { checkState, noIncidentsCopy } from "@/lib/monitoring/state";
import { SpeedReport, type SpeedRow } from "@/components/monitoring/speed-report";
import type { PageSpeedReport } from "@/lib/monitoring/pagespeed";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const now = new Date();

  const [monitors, incidents, clients, summary] = await Promise.all([
    prisma.monitor.findMany({
      where: { organizationId, isDemo: scope.isDemo },
      include: {
        client: { select: { businessName: true } },
        checks: { orderBy: { observedAt: "desc" }, take: 1, select: { detail: true, trigger: true } },
        _count: { select: { incidents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        isDemo: scope.isDemo,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] },
      },
      include: { monitor: { select: { name: true } } },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    }),
    prisma.client.findMany({
      where: { organizationId, isDemo: scope.isDemo },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
    getMonitoringSummary(organizationId, scope.isDemo, now),
  ]);

  const monitorRows: MonitorRow[] = monitors.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.kind ?? m.type,
    target: m.target,
    environment: m.environment,
    clientName: m.client?.businessName ?? null,
    enabled: m.enabled,
    isDemo: m.isDemo,
    state: checkState({ ...m, type: m.kind ?? m.type }, now),
    lastDetail: m.checks[0]?.detail ?? null,
    lastCheckAt: m.lastCheckAt ? m.lastCheckAt.toISOString() : null,
    cadenceMinutes: m.cadenceMinutes,
    confirmAfter: m.confirmAfter,
    consecutiveFailures: m.consecutiveFailures,
    incidentCount: m._count.incidents,
  }));

  const speedRows: SpeedRow[] = [];
  monitors.forEach((m) => {
    if (m.type !== "PAGE_SPEED") return;
    const st = m.state as { pageSpeed?: PageSpeedReport; measuredAt?: string } | null;
    if (!st?.pageSpeed) return;
    let site = m.target;
    try {
      site = new URL(m.target).host;
    } catch {
      /* keep the raw target */
    }
    speedRows.push({ id: m.id, site, measuredAt: st.measuredAt ?? null, report: st.pageSpeed });
  });

  const incidentRows: IncidentRow[] = incidents.map((i) => ({
    id: i.id,
    title: i.title,
    severity: i.severity,
    status: i.status,
    occurrenceCount: i.occurrenceCount,
    monitorName: i.monitor?.name ?? null,
    environment: i.environment,
    firstSeenAt: i.firstSeenAt.toISOString(),
    lastSeenAt: i.lastSeenAt.toISOString(),
  }));

  return (
    <PageShell title="Monitoring & Incidents">
      <ReconcileStrip summary={summary} focus="checks" />
      <SpeedReport rows={speedRows} />
      <MonitoringWorkspace
        monitors={monitorRows}
        incidents={incidentRows}
        clients={clients}
        emptyIncidents={noIncidentsCopy(summary.checks)}
      />
    </PageShell>
  );
}
