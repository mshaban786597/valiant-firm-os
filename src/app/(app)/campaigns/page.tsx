import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CampaignsWorkspace, type CampaignRow } from "@/components/crm/campaigns-workspace";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function CampaignsPage() {
  const { organizationId } = await requireSessionOrg();

  const [campaigns, clients] = await Promise.all([
    prisma.campaign.findMany({
      where: { organizationId },
      include: { client: { select: { businessName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    clientName: c.client?.businessName ?? null,
    channel: c.channel,
    status: c.status,
    budgetCents: c.budgetCents,
  }));

  const active = campaigns.filter((c) => c.status === "active").length;
  const totalBudget = campaigns.reduce((s, c) => s + c.budgetCents, 0);

  return (
    <PageShell title="Campaigns">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Campaigns" value={String(campaigns.length)} />
        <KpiCard label="Active" value={String(active)} />
        <KpiCard label="Total monthly budget" value={formatCents(totalBudget)} />
      </div>
      <CampaignsWorkspace campaigns={rows} clients={clients} />
    </PageShell>
  );
}
