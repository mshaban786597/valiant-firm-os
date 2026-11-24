import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AdsWorkspace, type AdsRow } from "@/components/google-ads/ads-workspace";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function GoogleAdsPage() {
  const { organizationId } = await requireSessionOrg();

  const [campaigns, clients, connection] = await Promise.all([
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
    prisma.integrationVerification.findUnique({
      where: { organizationId_integrationId: { organizationId, integrationId: "google-ads" } },
      select: { lastTestAt: true, lastTestOk: true, lastTestDetail: true },
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
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">Google Ads connection</span>
          <span
            className={
              connection?.lastTestOk
                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
            }
          >
            {connection?.lastTestAt ? (connection.lastTestOk ? "Reading data" : "No data") : "Not synced yet"}
          </span>
        </div>
        <p className="mt-2 text-muted">
          {connection?.lastTestDetail ??
            "Press Sync from Google Ads to read the last 30 days of campaign totals from the accounts the service account was added to."}
        </p>
        <p className="mt-1 text-xs text-muted">
          Read only: the app never changes an ad, a budget or a setting. Synced figures cover the last 30 days.
          {connection?.lastTestAt ? ` Last checked ${connection.lastTestAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : ""}
        </p>
      </div>
      <AdsWorkspace campaigns={rows} clients={clients} />
    </PageShell>
  );
}
