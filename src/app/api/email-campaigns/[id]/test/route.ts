import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { buildTestEmail, campaignRecipientAllowed, campaignSender, sendCampaignEmail } from "@/lib/email/campaign";

export const runtime = "nodejs";

/**
 * Send one test copy of a campaign to the owner's own inbox (ALERT_EMAIL_TO).
 * Uses the same switches and the same allowed-recipient list as a real send,
 * and never touches the campaign's recipients.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("email.write");
  if (!org.ok) return org.response;

  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, subject: true, body: true },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sender = campaignSender();
  if (!sender.ready) return NextResponse.json({ error: `${sender.reason} Nothing was sent.` }, { status: 409 });

  const to = (process.env.ALERT_EMAIL_TO ?? "").trim();
  if (!to) return NextResponse.json({ error: "No inbox is set for you (ALERT_EMAIL_TO). Nothing was sent." }, { status: 409 });
  if (!campaignRecipientAllowed(to)) {
    return NextResponse.json({ error: `${to} is not on the allowed recipient list. Nothing was sent.` }, { status: 409 });
  }

  const receipt = await sendCampaignEmail(buildTestEmail(campaign, to, sender), sender);
  if (receipt.status !== "accepted") {
    return NextResponse.json({ error: `The email service did not accept the test: ${receipt.error}` }, { status: 502 });
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "email_campaign.test_send",
    entity: "EmailCampaign",
    entityId: campaign.id,
  });
  return NextResponse.json({ ok: true, to });
}
