import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmailWorkspace, type CampaignRow } from "@/components/email/email-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function EmailCampaignsPage() {
  const { organizationId } = await requireSessionOrg();

  const campaigns = await prisma.emailCampaign.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    status: c.status,
    recipientCount: c.recipientCount,
    opens: c.opens,
    clicks: c.clicks,
    unsubscribes: c.unsubscribes,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
  }));

  const sent = campaigns.filter((c) => c.status === "sent");
  const totalRecipients = sent.reduce((s, c) => s + c.recipientCount, 0);
  const totalOpens = sent.reduce((s, c) => s + c.opens, 0);
  const openRate = totalRecipients ? Math.round((totalOpens / totalRecipients) * 100) : 0;

  return (
    <PageShell title="Email Campaigns">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Campaigns" value={String(campaigns.length)} />
        <KpiCard label="Sent" value={String(sent.length)} />
        <KpiCard label="Recipients reached" value={totalRecipients.toLocaleString()} />
        <KpiCard label="Avg open rate" value={`${openRate}%`} hint="Sent campaigns" />
      </div>
      <EmailWorkspace campaigns={rows} />
    </PageShell>
  );
}
