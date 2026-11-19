import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { adsUpdateSchema } from "@/lib/schemas/google-ads";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const existing = await prisma.googleAdsCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, campaignId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = adsUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.action === "refresh") {
    return NextResponse.json(
      { error: "Google Ads is not connected yet, so there is nothing to sync. No numbers were changed." },
      { status: 409 },
    );
  }
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.clientId !== undefined) data.clientId = parsed.data.clientId;

  const campaign = await prisma.googleAdsCampaign.update({
    where: { id: existing.id },
    data,
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: parsed.data.action === "refresh" ? "ads.refresh" : "ads.update",
    entity: "GoogleAdsCampaign",
    entityId: campaign.id,
  });

  return NextResponse.json({ campaign });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const existing = await prisma.googleAdsCampaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.googleAdsCampaign.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "ads.delete",
    entity: "GoogleAdsCampaign",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
