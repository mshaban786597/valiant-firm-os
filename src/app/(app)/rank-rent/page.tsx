import { PageShell } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/utils";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function RankRentPage() {
  const { organizationId } = await requireSessionOrg();

  const assets = await prisma.rankRentAsset.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const variant = (status: string) => {
    if (status.includes("Rented") || status.includes("LeadGenerating"))
      return "success" as const;
    if (status.includes("Ranking")) return "info" as const;
    return "neutral" as const;
  };

  return (
    <PageShell title="Rank-and-Rent Assets">
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Geo</th>
              <th className="px-4 py-3">Traffic</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3 font-semibold">
                  {a.domain}
                  <div className="text-xs font-normal text-muted">{a.niche}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {a.city}, {a.state}
                </td>
                <td className="px-4 py-3 text-xs">
                  Traffic {a.organicTraffic ?? "—"}
                  <div className="text-muted">Leads {a.leadsGenerated ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-xs font-medium">
                  {formatCurrency(money(a.monthlyRevenue))}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={a.status} variant={variant(String(a.status))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
