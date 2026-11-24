import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import {
  buildRankRows,
  filterRanks,
  summarizeRanks,
  trendSegments,
  type RankFilter,
  type RankRow,
} from "@/lib/seo/rank-tracking";

export const dynamic = "force-dynamic";

const host = (siteUrl: string) =>
  siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");

const FILTERS: { key: RankFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "top10", label: "Page 1" },
  { key: "up", label: "Moved up" },
  { key: "down", label: "Moved down" },
  { key: "new", label: "New" },
  { key: "lost", label: "Not seen this week" },
];

function band(pos: number) {
  if (pos <= 3) return { label: "Top 3", variant: "success" as const };
  if (pos <= 10) return { label: "Page 1", variant: "info" as const };
  if (pos <= 20) return { label: "Page 2", variant: "warning" as const };
  return { label: "Page 3+", variant: "neutral" as const };
}

function Movement({ row }: { row: RankRow }) {
  if (row.status === "new") return <StatusBadge label="New" variant="info" />;
  if (row.status === "lost") return <StatusBadge label="Not seen" variant="neutral" />;
  if (row.status === "flat") return <span className="text-xs text-muted">No change</span>;
  const up = row.status === "up";
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-700 dark:text-emerald-300" : "text-valiant dark:text-red-300"}`}>
      {up ? "▲ Up" : "▼ Down"} {Math.abs(row.change!).toFixed(1)}
    </span>
  );
}

function Trend({ row }: { row: RankRow }) {
  const segments = trendSegments(row.trend);
  if (segments.length === 0) return <span className="text-xs text-muted">—</span>;
  return (
    <svg
      width="96"
      height="24"
      viewBox="0 0 96 24"
      role="img"
      aria-label={`Position over the last ${row.trend.length} days, seen on ${row.daysSeen} days, best ${row.best}`}
      className="text-foreground"
    >
      {segments.map((points, i) =>
        points.indexOf(" ") === -1 ? (
          <circle key={i} cx={points.split(",")[0]} cy={points.split(",")[1]} r="1.5" fill="currentColor" />
        ) : (
          <polyline key={i} points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        ),
      )}
    </svg>
  );
}

export default async function RankTrackingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organizationId } = await requireSessionOrg();

  const properties = await prisma.gscProperty.findMany({
    where: { organizationId, dataSource: "live", periodEnd: { not: null } },
    include: { client: { select: { businessName: true } } },
    orderBy: { impressions28d: "desc" },
  });
  const property = properties.filter((p) => p.id === searchParams?.property)[0] ?? properties[0] ?? null;

  if (!property) {
    return (
      <PageShell title="Rank Tracking">
        <SeoTabs />
        <EmptyState
          title="No Search Console data yet"
          description="Connect and sync a property on the Overview tab. Rankings are tracked from the positions Google reports each day."
        />
      </PageShell>
    );
  }

  const end = property.periodEnd!;
  const from = new Date(end.getTime() - 27 * 86_400_000);
  const days = await prisma.gscRankDay.findMany({
    where: { propertyId: property.id, date: { gte: from, lte: end } },
    select: { query: true, date: true, clicks: true, impressions: true, position: true },
    take: 60_000,
  });

  const all = buildRankRows(
    days.map((d) => ({ ...d, date: d.date.toISOString().slice(0, 10) })),
    end,
  );
  const summary = summarizeRanks(all);
  const filter = (FILTERS.filter((f) => f.key === searchParams?.filter)[0]?.key ?? "all") as RankFilter;
  const rows = filterRanks(all, filter);
  const firstDay = days.length ? days.reduce((m, d) => (d.date < m ? d.date : m), days[0]!.date) : null;

  const chip = (active: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs font-semibold ${active ? "border-valiant/40 bg-valiant-soft" : "border-card-border text-muted hover:text-foreground"}`;
  const link = (params: { property?: string; filter?: string }) => {
    const q = new URLSearchParams();
    q.set("property", params.property ?? property.id);
    const f = params.filter ?? filter;
    if (f !== "all") q.set("filter", f);
    return `/seo/rank-tracking?${q.toString()}`;
  };

  return (
    <PageShell title="Rank Tracking">
      <SeoTabs />
      <div className="flex flex-wrap gap-2">
        {properties.map((p) => (
          <Link key={p.id} href={link({ property: p.id, filter: "all" })} className={chip(p.id === property.id)}>
            {host(p.siteUrl)}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-card-border bg-card p-3 text-xs text-muted">
        <span className="font-semibold text-foreground">{property.client?.businessName ?? host(property.siteUrl)}</span> ·
        positions observed in Search Console, web search
        {firstDay ? `, ${firstDay.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}` : ""}. Current
        = last 7 days, previous = the 7 days before, both weighted by impressions. A day with no impressions has
        no position. Each sync adds new days, so history grows over time.
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="No daily positions stored yet"
          description="Press Sync for this property on the Overview tab to pull its daily positions."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
            <KpiCard label="Queries tracked" value={summary.tracked.toLocaleString()} hint="Seen in the last 28 days" />
            <KpiCard label="Ranking this week" value={summary.rankingNow.toLocaleString()} />
            <KpiCard label="Top 3" value={String(summary.top3)} />
            <KpiCard label="Page 1" value={String(summary.page1)} />
            <KpiCard label="Moved up" value={String(summary.improved)} hint="vs previous 7 days" />
            <KpiCard label="Moved down" value={String(summary.declined)} hint="vs previous 7 days" />
            <KpiCard label="New this week" value={String(summary.newlySeen)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link key={f.key} href={link({ filter: f.key })} className={chip(filter === f.key)}>
                {f.label}
              </Link>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No queries match this filter" description="Choose another filter above." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Query</th>
                    <th className="px-4 py-3">Position now</th>
                    <th className="px-4 py-3">Previous</th>
                    <th className="px-4 py-3">Movement</th>
                    <th className="px-4 py-3">Best (28d)</th>
                    <th className="px-4 py-3">Impressions</th>
                    <th className="px-4 py-3">Clicks</th>
                    <th className="px-4 py-3">28-day trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr key={r.query} className="border-t border-card-border hover:bg-background/30">
                      <td className="px-4 py-3 font-medium">{r.query}</td>
                      <td className="px-4 py-3">
                        {r.current === null ? (
                          <span className="text-xs text-muted">Not seen</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="font-semibold">{r.current.toFixed(1)}</span>
                            <StatusBadge label={band(r.current).label} variant={band(r.current).variant} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{r.previous === null ? "—" : r.previous.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <Movement row={r} />
                      </td>
                      <td className="px-4 py-3">{r.best.toFixed(1)}</td>
                      <td className="px-4 py-3">{r.impressions.toLocaleString()}</td>
                      <td className="px-4 py-3">{r.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Trend row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 300 ? (
            <p className="text-xs text-muted">Showing the first 300 of {rows.length.toLocaleString()} queries.</p>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
