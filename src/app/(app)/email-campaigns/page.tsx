import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmailWorkspace, type CampaignRow } from "@/components/email/email-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { EMPTY_COUNTS, campaignSender, countsFrom, countsLine, deliveredBase } from "@/lib/email/campaign";

export const dynamic = "force-dynamic";

export default async function EmailCampaignsPage() {
  const { organizationId } = await requireSessionOrg();

  const campaigns = await prisma.emailCampaign.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const groups = await prisma.emailRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    _count: { _all: true },
  });

  const rows: CampaignRow[] = campaigns.map((c) => {
    const mine = groups.filter((g) => g.campaignId === c.id).map((g) => ({ status: g.status, count: g._count._all }));
    const counts = mine.length ? countsFrom(mine) : EMPTY_COUNTS;
    return {
      id: c.id,
      name: c.name,
      subject: c.subject,
      status: c.status,
      recipientCount: c.recipientCount,
      delivered: deliveredBase(counts),
      progress: c.status === "draft" ? null : countsLine(counts),
      opens: c.opens,
      clicks: c.clicks,
      unsubscribes: c.unsubscribes,
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    };
  });

  const sent = rows.filter((c) => c.status === "sent");
  const reached = rows.reduce((s, c) => s + c.delivered, 0);
  const opens = rows.reduce((s, c) => s + c.opens, 0);
  const openRate = reached ? Math.round((opens / reached) * 100) : 0;

  const sender = campaignSender();
  const sending = sender.ready
    ? { on: true, text: `Sending from ${sender.from}, up to ${sender.dailyLimit} emails a day. Every email carries an unsubscribe link.` }
    : { on: false, text: `${sender.reason} Nothing will be sent.` };

  return (
    <PageShell title="Email Campaigns">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Campaigns" value={String(campaigns.length)} />
        <KpiCard label="Sent" value={String(sent.length)} />
        <KpiCard label="Emails sent" value={reached.toLocaleString()} />
        <KpiCard label="Avg open rate" value={reached ? `${openRate}%` : "—"} hint="Of emails sent" />
      </div>
      <EmailWorkspace campaigns={rows} sending={sending} />
    </PageShell>
  );
}
