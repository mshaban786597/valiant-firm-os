import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { emailCampaignUpdateSchema } from "@/lib/schemas/email-campaign";
import { notify } from "@/lib/notifications/dispatch";
import { campaignSender, countsLine } from "@/lib/email/campaign";
import { processCampaign } from "@/lib/email/campaign-run";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: { recipients: { orderBy: { createdAt: "asc" }, take: 500 } },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("email.write");
  if (!org.ok) return org.response;

  const existing = await prisma.emailCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, status: true, name: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = emailCampaignUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.action === "send") {
    // Refuse rather than mark it sent when nothing can really go out.
    const sender = campaignSender();
    if (!sender.ready) {
      return NextResponse.json({ error: `${sender.reason} Nothing was sent.` }, { status: 409 });
    }
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "This campaign was already sent." }, { status: 409 });
    }
    const waiting = await prisma.emailRecipient.count({ where: { campaignId: existing.id, status: "pending" } });
    if (waiting === 0) {
      return NextResponse.json({ error: "Add recipients first. Nothing was sent." }, { status: 400 });
    }
    // Claim the campaign so two clicks cannot start it twice.
    const claimed = await prisma.emailCampaign.updateMany({
      where: { id: existing.id, organizationId: org.organizationId, status: "draft" },
      data: { status: "sending" },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "This campaign was already sent." }, { status: 409 });
    }
    await writeAuditLog({
      organizationId: org.organizationId,
      userId: org.userId,
      action: "email_campaign.send",
      entity: "EmailCampaign",
      entityId: existing.id,
      meta: { recipients: waiting },
    });

    const run = await processCampaign({ organizationId: org.organizationId, campaignId: existing.id });
    if (run?.finished) {
      await notify({
        organizationId: org.organizationId,
        event: "campaign_sent",
        title: `${existing.name}: ${countsLine(run.counts)}`,
        path: "/email-campaigns",
      });
    }
    return NextResponse.json({
      status: run?.finished ? "sent" : "sending",
      sent: run?.sent ?? 0,
      refused: run?.refused ?? 0,
      skipped: run?.skipped ?? 0,
      remaining: run?.remaining ?? waiting,
    });
  }

  // Field edits are only allowed while still a draft.
  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft campaigns can be edited." },
      { status: 409 },
    );
  }
  const data: Record<string, unknown> = {};
  for (const k of ["name", "subject", "body"] as const) {
    if (parsed.data[k] !== undefined) data[k] = parsed.data[k];
  }
  const campaign = await prisma.emailCampaign.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json({ campaign });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("email.write");
  if (!org.ok) return org.response;

  const existing = await prisma.emailCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.emailCampaign.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "email_campaign.delete",
    entity: "EmailCampaign",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
