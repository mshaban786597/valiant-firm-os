import { IncidentStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  MonitoringWorkspace,
  type IncidentRow,
  type MonitorRow,
} from "@/components/monitoring/monitoring-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function MonitoringPage() {
  const { organizationId } = await requireSessionOrg();

  const [monitors, incidents, openCount, clients] = await Promise.all([
    prisma.monitor.findMany({
      where: { organizationId },
      include: {
        client: { select: { businessName: true } },
        _count: { select: { incidents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] },
      },
      include: { monitor: { select: { name: true } } },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    }),
    prisma.incident.count({
      where: { organizationId, status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] } },
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  const monitorRows: MonitorRow[] = monitors.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    target: m.target,
    clientName: m.client?.businessName ?? null,
    enabled: m.enabled,
    lastStatus: m.lastStatus,
    lastCheckAt: m.lastCheckAt ? m.lastCheckAt.toISOString() : null,
    incidentCount: m._count.incidents,
  }));

  const incidentRows: IncidentRow[] = incidents.map((i) => ({
    id: i.id,
    title: i.title,
    severity: i.severity,
    status: i.status,
    occurrenceCount: i.occurrenceCount,
    monitorName: i.monitor?.name ?? null,
    firstSeenAt: i.firstSeenAt.toISOString(),
  }));

  const healthy = monitors.filter((m) => m.lastStatus === "ok").length;
  const checked = monitors.filter((m) => m.lastStatus).length;
  const uptimePct = checked ? Math.round((healthy / checked) * 100) : 0;

  return (
    <PageShell title="Monitoring & Incidents">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Monitors" value={String(monitors.length)} />
        <KpiCard label="Open incidents" value={String(openCount)} />
        <KpiCard label="Healthy checks" value={`${healthy}/${checked}`} />
        <KpiCard label="Uptime (last check)" value={checked ? `${uptimePct}%` : "—"} />
      </div>
      <MonitoringWorkspace monitors={monitorRows} incidents={incidentRows} clients={clients} />
    </PageShell>
  );
}
