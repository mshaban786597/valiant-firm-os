import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { adsUpdateSchema } from "@/lib/schemas/google-ads";
import { sampleAdsMetrics } from "@/lib/integrations/sample";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
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
    const m = sampleAdsMetrics(`${existing.campaignId}:${Date.now()}`);
    Object.assign(data, {
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      costPerConv: m.costPerConv,
      lastSyncAt: new Date(),
    });
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
  const org = await requireApiOrg();
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
