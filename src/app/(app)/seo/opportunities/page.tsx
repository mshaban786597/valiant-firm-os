import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard, KpiCardAccent } from "@/components/dashboard/kpi-card";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import {
  BUCKET_LABEL,
  buildOpportunities,
  groupByPage,
  keywordGaps,
  opportunityTotals,
  type Bucket,
  type KeywordMetric,
  type QueryPageRow,
} from "@/lib/seo/opportunities";

export const dynamic = "force-dynamic";

const BUCKET_VARIANT: Record<Bucket, "success" | "info" | "warning" | "neutral"> = {
  quick_win: "success",
  striking_distance: "info",
  defend: "neutral",
  long_shot: "warning",
};

const host = (siteUrl: string) => siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const path = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
};

export default async function SeoOpportunitiesPage({
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
      <PageShell title="SEO Opportunities">
        <SeoTabs />
        <EmptyState
          title="No Search Console data yet"
          description="Connect and sync a property on the Overview tab. Opportunities are built from the queries and pages Google reports."
        />
      </PageShell>
    );
  }

  const domain = host(property.siteUrl);
  const [metrics, snapshots] = await Promise.all([
    prisma.gscMetric.findMany({
      where: { propertyId: property.id, dimension: "query_page", periodEnd: property.periodEnd! },
      select: { key: true, clicks: true, impressions: true, position: true },
      take: 25_000,
    }),
    prisma.seoSnapshot.findMany({
      where: { organizationId, domain, kind: "keywords" },
      orderBy: { observedAt: "desc" },
      take: 1,
    }),
  ]);

  const rows: QueryPageRow[] = metrics.map((m) => {
    const i = m.key.indexOf("\t");
    return { query: m.key.slice(0, i), page: m.key.slice(i + 1), clicks: m.clicks, impressions: m.impressions, position: m.position };
  });

  // Third-party keyword metrics (monthly searches, difficulty), when a snapshot exists.
  const snap = snapshots[0] ?? null;
  const toolRows = ((snap?.data as { rows?: { keyword: string; volume: number; seoDifficulty?: number; position?: number; url?: string }[] } | null)?.rows ?? []);
  const metricMap: Record<string, KeywordMetric> = {};
  toolRows.forEach((k) => (metricMap[k.keyword.trim().toLowerCase()] = { volume: k.volume, difficulty: k.seoDifficulty ?? null }));

  const periodDays =
    property.periodStart && property.periodEnd
      ? Math.round((property.periodEnd.getTime() - property.periodStart.getTime()) / 86_400_000) + 1
      : 28;
  const opps = buildOpportunities(rows, metricMap, periodDays);
  const pages = groupByPage(opps);
  const totals = opportunityTotals(opps);
  const gaps = keywordGaps(toolRows, opps.map((o) => o.query)).slice(0, 15);
  const provider = snap ? (snap.provider === "ubersuggest" ? "Ubersuggest" : snap.provider) : null;

  const chip = (active: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs font-semibold ${active ? "border-valiant/40 bg-valiant-soft" : "border-card-border text-muted hover:text-foreground"}`;

  return (
    <PageShell title="SEO Opportunities">
      <SeoTabs />
      <div className="flex flex-wrap gap-2">
        {properties.map((p) => (
          <Link key={p.id} href={`/seo/opportunities?property=${p.id}`} className={chip(p.id === property.id)}>
            {host(p.siteUrl)}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-card-border bg-card p-3 text-xs text-muted">
        <span className="font-semibold text-foreground">{property.client?.businessName ?? domain}</span> · queries and
        ranking pages observed in Search Console, {property.periodStart?.toISOString().slice(0, 10)} to{" "}
        {property.periodEnd?.toISOString().slice(0, 10)}.{" "}
        {provider
          ? `Monthly searches and difficulty from ${provider} (snapshot ${snap!.observedAt.toISOString().slice(0, 10)}) for ${toolRows.length} keyword(s).`
          : "No keyword-tool snapshot for this site, so demand is taken from Search Console impressions only."}{" "}
        Potential clicks are an estimate (demand × average click-through at a realistic target position), not a forecast.
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No query-and-page data for this period"
          description="Press Sync on the Overview tab to pull which page ranks for each query."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <KpiCardAccent label="Est. extra clicks / month" value={totals.potentialClicks.toLocaleString()} />
            <KpiCard label="Queries seen" value={totals.queries.toLocaleString()} />
            <KpiCard label="Quick wins (page 1)" value={String(totals.quickWins)} hint="Positions 4 to 10" />
            <KpiCard label="Striking distance" value={String(totals.strikingDistance)} hint="Positions 11 to 20" />
            <KpiCard label="Long shots" value={String(totals.longShots)} hint="Position 21 and beyond" />
          </div>

          <section className="space-y-2">
            <h2 className="section-title">Pages to work on first</h2>
            <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Page</th>
                    <th className="px-4 py-3">Where it stands</th>
                    <th className="px-4 py-3">Queries</th>
                    <th className="px-4 py-3">Impressions</th>
                    <th className="px-4 py-3">Est. extra clicks / mo</th>
                    <th className="px-4 py-3">What to do</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.slice(0, 25).map((p) => (
                    <tr key={p.page} className="border-t border-card-border align-top hover:bg-background/30">
                      <td className="px-4 py-3">
                        <a className="break-all font-semibold hover:text-valiant" href={p.page} target="_blank" rel="noreferrer">
                          {path(p.page)}
                        </a>
                        <div className="mt-1 text-xs text-muted">
                          {p.topQueries.map((q) => `${q.query} (#${q.position.toFixed(0)})`).join(" · ")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={BUCKET_LABEL[p.bucket]} variant={BUCKET_VARIANT[p.bucket]} />
                      </td>
                      <td className="px-4 py-3">{p.queries}</td>
                      <td className="px-4 py-3">{p.impressions.toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold">{p.potentialClicks.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-muted">{p.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="section-title">Queries by opportunity</h2>
            <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Query</th>
                    <th className="px-4 py-3">Ranking page</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Impressions</th>
                    <th className="px-4 py-3">Monthly demand</th>
                    <th className="px-4 py-3">Difficulty</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Est. extra clicks / mo</th>
                  </tr>
                </thead>
                <tbody>
                  {opps.slice(0, 100).map((o) => (
                    <tr key={o.query} className="border-t border-card-border hover:bg-background/30">
                      <td className="px-4 py-3 font-medium">{o.query}</td>
                      <td className="break-all px-4 py-3 text-xs text-muted">{path(o.page)}</td>
                      <td className="px-4 py-3">{o.position.toFixed(1)}</td>
                      <td className="px-4 py-3">{o.impressions.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {o.monthlyDemand.toLocaleString()}
                        <span className="ml-1 text-[11px] text-muted">
                          {o.demandSource === "keyword_tool" ? (provider ?? "tool") : "GSC"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{o.difficulty === null ? "—" : o.difficulty}</td>
                      <td className="px-4 py-3">#{o.target}</td>
                      <td className="px-4 py-3 font-semibold">{o.potentialClicks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {opps.length > 100 ? (
              <p className="text-xs text-muted">Showing the top 100 of {opps.length.toLocaleString()} queries by priority.</p>
            ) : null}
          </section>

          {gaps.length ? (
            <section className="space-y-2">
              <h2 className="section-title">
                Keywords {provider} lists that Search Console did not report this period
              </h2>
              <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">Keyword</th>
                      <th className="px-4 py-3">Monthly searches</th>
                      <th className="px-4 py-3">Tool position</th>
                      <th className="px-4 py-3">Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((g) => (
                      <tr key={g.keyword} className="border-t border-card-border">
                        <td className="px-4 py-3 font-medium">{g.keyword}</td>
                        <td className="px-4 py-3">{g.volume.toLocaleString()}</td>
                        <td className="px-4 py-3">{g.position ?? "—"}</td>
                        <td className="break-all px-4 py-3 text-xs text-muted">{g.url ? path(g.url) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
