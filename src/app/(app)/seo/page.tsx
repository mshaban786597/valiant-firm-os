import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { GscWorkspace, type GscRow } from "@/components/seo/gsc-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

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
  }));

  const totalClicks = properties.reduce((s, p) => s + p.clicks28d, 0);
  const totalImpr = properties.reduce((s, p) => s + p.impressions28d, 0);
  const ctr = totalImpr ? (totalClicks / totalImpr) * 100 : 0;

  return (
    <PageShell title="SEO / Search Console">
      <SeoTabs />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Properties" value={String(properties.length)} />
        <KpiCard label="Clicks (28d)" value={totalClicks.toLocaleString()} />
        <KpiCard label="Impressions (28d)" value={totalImpr.toLocaleString()} />
        <KpiCard label="Avg CTR" value={`${ctr.toFixed(1)}%`} />
      </div>
      <GscWorkspace properties={rows} clients={clients} />
    </PageShell>
  );
}
