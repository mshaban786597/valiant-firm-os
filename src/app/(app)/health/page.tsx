import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReconcileStrip } from "@/components/monitoring/reconcile-strip";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";
import { getMonitoringSummary } from "@/lib/monitoring/summary";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const scoped = { organizationId, isDemo: scope.isDemo };

  const [clients, activeAlerts, historyAlerts, summary] = await Promise.all([
    prisma.client.findMany({ where: scoped, orderBy: { healthScore: "asc" }, take: 200 }),
    // Current: not dismissed and the linked incident (if any) has not recovered.
    prisma.founderAlert.findMany({
      where: { ...scoped, dismissed: false, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { client: { select: { businessName: true } } },
    }),
    // History: recovered or dismissed. Kept with original timestamps.
    prisma.founderAlert.findMany({
      where: { ...scoped, OR: [{ dismissed: true }, { resolvedAt: { not: null } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { client: { select: { businessName: true } } },
    }),
    getMonitoringSummary(organizationId, scope.isDemo),
  ]);

  return (
    <PageShell title="Client Health">
      <ReconcileStrip summary={summary} focus="alerts" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-card-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Active alerts ({activeAlerts.length})
            </div>
            <div className="mt-3 space-y-3">
              {activeAlerts.length ? (
                activeAlerts.map((a) => (
                  <div key={a.id} className="rounded-lg border border-valiant/25 bg-valiant-soft p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <div className="font-semibold">{a.title}</div>
                      <StatusBadge label={a.severity} variant="danger" />
                    </div>
                    <div className="mt-2 text-xs text-muted">{a.body}</div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <span className="text-muted">Raised {a.createdAt.toLocaleString()}</span>
                      {a.incidentId ? (
                        <Link className="text-valiant hover:underline" href="/monitoring">
                          Open incident
                        </Link>
                      ) : null}
                      {a.clientId ? (
                        <Link className="text-valiant hover:underline" href={`/clients/${a.clientId}`}>
                          {a.client?.businessName ?? "Open client record"}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted">
                  No active alerts in {scope.label.toLowerCase()}.
                  {historyAlerts.length ? ` ${historyAlerts.length} earlier alert(s) are in history below.` : ""}
                </div>
              )}
            </div>
          </div>

          {historyAlerts.length ? (
            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Alert history (recovered or dismissed)
              </div>
              <div className="mt-3 space-y-2">
                {historyAlerts.map((a) => (
                  <div key={a.id} className="rounded-lg border border-card-border bg-background p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <div className="font-medium">{a.title}</div>
                      <StatusBadge label={a.resolvedAt ? "Recovered" : "Dismissed"} variant="neutral" />
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Raised {a.createdAt.toLocaleString()}
                      {a.resolvedAt ? ` · recovered ${a.resolvedAt.toLocaleString()}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Health ladder (lowest first)
          </div>
          {clients.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No clients in {scope.label.toLowerCase()} yet.{" "}
              <Link className="text-valiant hover:underline" href="/clients">
                Add a client
              </Link>
              .
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-card-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-t border-card-border hover:bg-background/30">
                      <td className="px-3 py-2">
                        <Link className="font-semibold hover:text-valiant" href={`/clients/${c.id}`}>
                          {c.businessName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {c.healthScore === null ? (
                          <span className="text-xs text-muted">Not scored</span>
                        ) : (
                          <ScoreBadge score={c.healthScore} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge label={c.status} variant="neutral" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
