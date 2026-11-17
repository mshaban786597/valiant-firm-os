import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { GscWorkspace, type GscRow } from "@/components/seo/gsc-workspace";
import { VisibilityEstimates, type VisibilitySite } from "@/components/seo/visibility-estimates";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { GSC_STATE_COPY, aggregateCtr, type GscSyncState } from "@/lib/integrations/gsc";

export default async function SeoOverviewPage() {
  const { organizationId } = await requireSessionOrg();

  const [properties, clients] = await Promise.all([
    prisma.gscProperty.findMany({
      where: { organizationId },
      include: {
        client: { select: { businessName: true } },
        _count: { select: { keywords: true } },
      },
      orderBy: { siteUrl: "asc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  // Latest third-party snapshot per domain and kind (older ones stay as history).
  const snapshots = await prisma.seoSnapshot.findMany({
    where: { organizationId },
    orderBy: { observedAt: "desc" },
    take: 300,
  });
  const siteMap: Record<string, VisibilitySite> = {};
  const seenKind: Record<string, true> = {};
  snapshots.forEach((snap) => {
    const key = `${snap.domain}|${snap.kind}`;
    if (seenKind[key]) return;
    seenKind[key] = true;
    const site = (siteMap[snap.domain] = siteMap[snap.domain] ?? {
      domain: snap.domain,
      provider: snap.provider,
      location: snap.location,
      observedAt: snap.observedAt.toISOString(),
      overview: null,
      keywords: [],
    });
    if (snap.kind === "domain_overview") site.overview = snap.data as VisibilitySite["overview"];
    if (snap.kind === "keywords") {
      site.keywords = ((snap.data as { rows?: VisibilitySite["keywords"] }).rows ?? []).slice(0, 50);
    }
  });
  const visibility = Object.keys(siteMap).map((d) => siteMap[d]!);

  const rows: GscRow[] = properties.map((p) => ({
    id: p.id,
    siteUrl: p.siteUrl,
    clientName: p.client?.businessName ?? null,
    verified: p.verified,
    clicks28d: p.clicks28d,
    impressions28d: p.impressions28d,
    avgPosition: p.avgPosition,
    keywordCount: p._count.keywords,
    lastSyncAt: p.lastSyncAt ? p.lastSyncAt.toISOString() : null,
    dataSource: p.dataSource,
    syncState: p.syncState,
    stateCopy: p.lastError
      ? `${GSC_STATE_COPY[p.syncState as GscSyncState] ?? p.syncState} (${p.lastError})`
      : (GSC_STATE_COPY[p.syncState as GscSyncState] ?? p.syncState),
    lastAttemptAt: p.lastAttemptAt ? p.lastAttemptAt.toISOString() : null,
    dataThrough: p.dataThrough ? p.dataThrough.toISOString() : null,
    propertyType: p.propertyType,
    ctrPct: (() => {
      const c = aggregateCtr(p.clicks28d, p.impressions28d);
      return c === null ? null : c * 100;
    })(),
    disconnected: !!p.disconnectedAt,
  }));

  // Headline totals use observed Search Console data only; sample data is never mixed in.
  const liveProps = properties.filter((p) => p.dataSource === "live");
  const sampleCount = properties.filter((p) => p.dataSource === "sample").length;
  const totalClicks = liveProps.reduce((s, p) => s + p.clicks28d, 0);
  const totalImpr = liveProps.reduce((s, p) => s + p.impressions28d, 0);
  const ctr = aggregateCtr(totalClicks, totalImpr);
  const none = liveProps.length === 0;

  return (
    <PageShell title="SEO / Search Console">
      <SeoTabs />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Properties"
          value={String(properties.length)}
          hint={`${liveProps.length} with live data${sampleCount ? `, ${sampleCount} on sample data` : ""}`}
        />
        <KpiCard label="Clicks (28d, live)" value={none ? "No live data" : totalClicks.toLocaleString()} hint="Observed in Search Console" />
        <KpiCard label="Impressions (28d, live)" value={none ? "No live data" : totalImpr.toLocaleString()} hint="Observed in Search Console" />
        <KpiCard label="CTR (clicks ÷ impressions)" value={ctr === null ? "No live data" : `${(ctr * 100).toFixed(1)}%`} hint="Aggregate, not an average of rows" />
      </div>
      <GscWorkspace properties={rows} clients={clients} />
      <VisibilityEstimates sites={visibility} />
    </PageShell>
  );
}
