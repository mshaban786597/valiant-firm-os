import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AdsWorkspace, type AdsRow } from "@/components/google-ads/ads-workspace";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function GoogleAdsPage() {
  const { organizationId } = await requireSessionOrg();

  const [campaigns, clients] = await Promise.all([
    prisma.googleAdsCampaign.findMany({
      where: { organizationId },
      include: { client: { select: { businessName: true } } },
      orderBy: { spend: "desc" },
      take: 300,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  const rows: AdsRow[] = campaigns.map((c) => ({
    id: c.id,
    campaignName: c.campaignName,
    clientName: c.client?.businessName ?? null,
    status: c.status,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    conversions: c.conversions,
    costPerConv: c.costPerConv,
  }));

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConv = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const blendedCpa = totalConv ? Math.round(totalSpend / totalConv) : null;

  return (
    <PageShell title="Google Ads">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Spend" value={formatCents(totalSpend)} hint="All campaigns" />
        <KpiCard label="Clicks" value={totalClicks.toLocaleString()} />
        <KpiCard label="Conversions" value={String(totalConv)} />
        <KpiCard label="Blended CPA" value={blendedCpa != null ? formatCents(blendedCpa) : "—"} />
      </div>
      <AdsWorkspace campaigns={rows} clients={clients} />
    </PageShell>
  );
}
