import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function HealthPage() {
  const { organizationId } = await requireSessionOrg();

  const [clients, alerts] = await Promise.all([
    prisma.client.findMany({
      where: { organizationId },
      orderBy: { healthScore: "asc" },
      take: 200,
    }),
    prisma.founderAlert.findMany({
      where: { organizationId, dismissed: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { client: { select: { businessName: true } } },
    }),
  ]);

  return (
    <PageShell title="Client Health">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Founder alerts
          </div>
          <div className="mt-3 space-y-3">
            {alerts.length ? (
              alerts.map((a) => (
                <div key={a.id} className="rounded-lg border border-valiant/25 bg-valiant-soft p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <div className="font-semibold">{a.title}</div>
                    <StatusBadge label={a.severity} variant="danger" />
                  </div>
                  <div className="mt-2 text-xs text-muted">{a.body}</div>
                  {a.clientId ? (
                    <div className="mt-2 text-xs">
                      <Link className="text-valiant hover:underline" href={`/clients/${a.clientId}`}>
                        {a.client?.businessName ?? "Open client record"}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted">No active alerts.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Health ladder (lowest first)
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-card-border">
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
                      <ScoreBadge score={c.healthScore} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge label={c.status} variant="neutral" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            POST <code className="rounded bg-background px-1 py-0.5">/api/ai/health-risk-summary</code>{" "}
            snapshots scores, marks At Risk, opens retention tasks, and drafts check-in copy.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
