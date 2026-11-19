import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { emailCampaignUpdateSchema } from "@/lib/schemas/email-campaign";

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
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = emailCampaignUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.action === "send") {
    // Campaign sending is not wired to an email provider. Refuse rather than
    // mark it sent or show engagement that never happened.
    return NextResponse.json(
      { error: "Email campaign sending is not connected yet. Nothing was sent." },
      { status: 409 },
    );
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
