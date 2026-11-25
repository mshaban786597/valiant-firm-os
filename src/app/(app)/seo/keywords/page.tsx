import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { KeywordsTable, type KeywordRow } from "@/components/seo/keywords-table";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export const dynamic = "force-dynamic";

export default async function SeoKeywordsPage(
  props: {
    searchParams?: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const { organizationId } = await requireSessionOrg();

  const properties = await prisma.gscProperty.findMany({
    where: { organizationId, dataSource: "live", periodEnd: { not: null } },
    select: { id: true, siteUrl: true, periodStart: true, periodEnd: true },
    orderBy: { siteUrl: "asc" },
  });
  const selected = properties.filter((p) => p.id === searchParams?.property)[0] ?? null;
  const scope = selected ? [selected] : properties;

  // Observed Search Console queries for each property's latest synced period.
  const live = scope.length
    ? await prisma.gscMetric.findMany({
        where: {
          dimension: "query",
          OR: scope.map((p) => ({ propertyId: p.id, periodEnd: p.periodEnd! })),
        },
        include: { property: { select: { siteUrl: true } } },
        orderBy: [{ clicks: "desc" }, { impressions: "desc" }],
        take: 1500,
      })
    : [];

  const rows: KeywordRow[] = live.map((k) => ({
    id: k.id,
    query: k.key,
    site: k.property.siteUrl,
    clicks: k.clicks,
    impressions: k.impressions,
    ctr: k.impressions ? (k.clicks / k.impressions) * 100 : 0,
    position: k.position ?? 0,
  }));

  const period = scope[0]?.periodStart && scope[0]?.periodEnd
    ? `${scope[0].periodStart.toISOString().slice(0, 10)} to ${scope[0].periodEnd.toISOString().slice(0, 10)}`
    : null;
  const chip = (active: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs font-semibold ${active ? "border-valiant/40 bg-valiant-soft" : "border-card-border text-muted hover:text-foreground"}`;

  return (
    <PageShell title="Search Queries">
      <SeoTabs />
      {properties.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Link href="/seo/keywords" className={chip(!selected)}>
              All sites
            </Link>
            {properties.map((p) => (
              <Link key={p.id} href={`/seo/keywords?property=${p.id}`} className={chip(selected?.id === p.id)}>
                {p.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </Link>
            ))}
          </div>
          <div className="rounded-xl border border-card-border bg-card p-3 text-xs text-muted">
            Observed in Google Search Console{period ? `, ${period}` : ""}, web search. {rows.length} queries shown
            {rows.length === 1500 ? " (top 1,500)" : ""}. CTR is clicks divided by impressions for each query.
          </div>
        </>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No query data yet"
          description="Connect and sync a Search Console property on the Overview tab to see the queries people search."
        />
      ) : (
        <KeywordsTable rows={rows} />
      )}
    </PageShell>
  );
}
