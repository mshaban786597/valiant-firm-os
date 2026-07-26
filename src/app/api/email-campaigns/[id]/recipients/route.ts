import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { emailRecipientsSchema } from "@/lib/schemas/email-campaign";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("email.write");
  if (!org.ok) return org.response;

  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, status: true },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json(
      { error: "Recipients can only be added to a draft campaign." },
      { status: 409 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = emailRecipientsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Build the candidate recipient set from the requested source(s).
  const candidates: { email: string; clientId?: string; leadId?: string }[] = [];

  if (parsed.data.source === "clients") {
    const clients = await prisma.client.findMany({
      where: { organizationId: org.organizationId, email: { not: null } },
      select: { id: true, email: true },
    });
    for (const c of clients) {
      if (c.email) candidates.push({ email: c.email, clientId: c.id });
    }
  }
  if (parsed.data.source === "leads") {
    const leads = await prisma.lead.findMany({
      where: { organizationId: org.organizationId, email: { not: null } },
      select: { id: true, email: true },
    });
    for (const l of leads) {
      if (l.email) candidates.push({ email: l.email, leadId: l.id });
    }
  }
  for (const email of parsed.data.emails ?? []) {
    candidates.push({ email });
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "No recipients with valid email addresses were found." },
      { status: 400 },
    );
  }

  // Dedupe against emails already on the campaign and within this batch.
  const existing = await prisma.emailRecipient.findMany({
    where: { campaignId: campaign.id },
    select: { email: true },
  });
  const seen = new Set(existing.map((r) => r.email.toLowerCase()));
  const toAdd: typeof candidates = [];
  for (const c of candidates) {
    const key = c.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    toAdd.push(c);
  }

  if (toAdd.length > 0) {
    await prisma.emailRecipient.createMany({
      data: toAdd.map((c) => ({
        campaignId: campaign.id,
        email: c.email,
        clientId: c.clientId ?? null,
        leadId: c.leadId ?? null,
        status: "pending",
      })),
    });
    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { recipientCount: seen.size },
    });
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "email_campaign.recipients_add",
    entity: "EmailCampaign",
    entityId: campaign.id,
    meta: { added: toAdd.length, total: seen.size },
  });

  return NextResponse.json({ added: toAdd.length, total: seen.size });
}
