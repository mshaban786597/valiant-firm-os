import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { AddAssetButton, EditAssetButton } from "@/components/rank-rent/asset-forms";
import { formatCurrency } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { liveForDomains } from "@/lib/rank-rent/live";
import { RANK_RENT_STATUS_LABEL } from "@/lib/schemas/rank-rent";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("en-US");

const variant = (status: string) => {
  if (status === "Rented" || status === "LeadGenerating") return "success" as const;
  if (status === "Ranking") return "info" as const;
  return "neutral" as const;
};

export default async function RankRentPage() {
  const { organizationId } = await requireSessionOrg();
  const assets = await prisma.rankRentAsset.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const live = await liveForDomains(
    organizationId,
    assets.map((a) => a.domain),
  );

  const rented = assets.filter((a) => a.status === "Rented").length;
  const rent = assets.reduce((s, a) => s + (a.monthlyRevenue === null ? 0 : Number(a.monthlyRevenue)), 0);
  const anyRent = assets.some((a) => a.monthlyRevenue !== null);
  const clicks = assets.reduce((s, a) => s + (live[a.domain]?.google?.clicks ?? 0), 0);

  return (
    <PageShell title="Rank-and-Rent Sites" actions={<AddAssetButton />}>
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Our own lead-generation sites. Google and Analytics numbers are read live for each domain (last 28 days) and
        are never typed in. Stage, renter and rent are yours to set.
      </div>

      {assets.length === 0 ? (
        <EmptyState title="No rank-and-rent site listed" description="Use Add a site to list one of your own lead-generation websites." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Sites" value={String(assets.length)} />
            <KpiCard label="Rented" value={`${rented} of ${assets.length}`} />
            <KpiCard label="Monthly rent" value={anyRent ? formatCurrency(rent) : "—"} hint={anyRent ? "Sum of rent entered" : "No rent entered yet"} />
            <KpiCard label="Google clicks" value={num(clicks)} hint="All sites, last 28 days" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Google (28 days)</th>
                  <th className="px-4 py-3">Analytics (28 days)</th>
                  <th className="px-4 py-3">Site health</th>
                  <th className="px-4 py-3">Renter</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const l = live[a.domain];
                  return (
                    <tr key={a.id} className="border-t border-card-border align-top">
                      <td className="px-4 py-3">
                        <a href={`https://${a.domain}`} target="_blank" rel="noreferrer" className="font-semibold hover:text-valiant">
                          {a.domain}
                        </a>
                        <div className="text-xs text-muted">
                          {a.niche} · {a.city}, {a.state}
                        </div>
                        {l?.topQueries.length ? (
                          <div className="mt-1 max-w-[260px] text-[11px] text-muted">
                            Top searches: {l.topQueries.slice(0, 3).map((q) => q.query).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {l?.google ? (
                          <>
                            <div>
                              {num(l.google.clicks)} clicks · {num(l.google.impressions)} impressions
                            </div>
                            <div className="text-muted">
                              Average position {l.google.avgPosition !== null ? l.google.avgPosition.toFixed(1) : "—"}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">Search Console not connected</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {l?.analytics ? (
                          <>
                            <div>
                              {num(l.analytics.sessions)} sessions · {num(l.analytics.keyEvents)} key events
                            </div>
                            {l.analytics.properties > 1 ? (
                              <div className="text-amber-700 dark:text-amber-400">Largest of {l.analytics.properties} properties on this site</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">Analytics not connected</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {l && l.checks > 0 ? (
                          <>
                            <Link href="/monitoring" className={l.openIncidents ? "font-semibold text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}>
                              {l.openIncidents ? `${l.openIncidents} open issue${l.openIncidents === 1 ? "" : "s"}` : "No open issues"}
                            </Link>
                            <div className="text-muted">
                              {l.checks} checks{l.pagesInSitemap !== null ? ` · ${l.pagesInSitemap} pages` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">Not monitored</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {a.renterStatus ?? <span className="text-muted">No renter recorded</span>}
                        <div className="text-muted">{a.monthlyRevenue !== null ? `${formatCurrency(Number(a.monthlyRevenue))} / month` : "No rent entered"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={RANK_RENT_STATUS_LABEL[a.status]} variant={variant(a.status)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EditAssetButton
                          asset={{
                            id: a.id,
                            domain: a.domain,
                            status: a.status,
                            renterStatus: a.renterStatus,
                            monthlyRevenue: a.monthlyRevenue === null ? null : Number(a.monthlyRevenue),
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}
