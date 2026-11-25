import { PageShell } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ReportsWorkspace,
  type ReportRow,
} from "@/components/reports/reports-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const isDemo = scope.isDemo;

  const [reports, incidentReports, clients] = await Promise.all([
    prisma.report.findMany({
      where: { organizationId, isDemo, kind: "monthly" },
      include: { client: { select: { businessName: true } } },
      orderBy: { month: "desc" },
      take: 200,
    }),
    prisma.report.findMany({
      where: { organizationId, isDemo, kind: "incident" },
      include: { client: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.client.findMany({
      where: { organizationId, isDemo },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
      take: 300,
    }),
  ]);

  const rows: ReportRow[] = reports.map((r) => ({
    id: r.id,
    month: r.month,
    clientId: r.clientId,
    clientName: r.client.businessName,
    organicSessions: r.organicSessions,
    organicLeads: r.organicLeads,
    status: r.status,
  }));

  return (
    <PageShell title="Reporting Engine">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Showing {scope.label.toLowerCase()}. Monthly reports hold the metrics you enter; incident
        reports are built from stored check results and the approved change, and can only be marked
        client-ready once that change is approved and verified.
      </div>

      <section className="space-y-2">
        <h2 className="section-title">Incident reports</h2>
        {incidentReports.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
            No incident reports in {scope.label.toLowerCase()} yet. One is created from a resolved
            incident and its evidence.
          </div>
        ) : (
          <div className="space-y-3">
            {incidentReports.map((r) => {
              const ev = r.evidence as {
                source?: string;
                period?: { from: string; to: string };
                lastObservationAt?: string | null;
                outstanding?: string[];
              } | null;
              return (
                <div key={r.id} className="rounded-xl border border-card-border bg-card p-4 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{r.client.businessName}</div>
                      <div className="text-xs text-muted">
                        Version {r.version} · created {r.createdAt.toLocaleString()}
                      </div>
                    </div>
                    <StatusBadge
                      label={r.clientFacing ? "Client-ready" : "Internal draft"}
                      variant={r.clientFacing ? "success" : "neutral"}
                    />
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-background p-3 text-xs">{r.reportSummary}</pre>
                  {ev ? (
                    <div className="mt-2 text-[11px] text-muted">
                      Source: {ev.source ?? "—"}
                      {ev.period ? ` · window ${ev.period.from.slice(0, 16)} → ${ev.period.to.slice(0, 16)} UTC` : ""}
                      {ev.lastObservationAt ? ` · last observation ${ev.lastObservationAt.slice(0, 16)} UTC` : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="section-title">Monthly reports</h2>
        <ReportsWorkspace reports={rows} clients={clients} />
      </section>
    </PageShell>
  );
}
