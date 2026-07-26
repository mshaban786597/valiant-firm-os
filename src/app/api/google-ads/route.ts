import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { adsCreateSchema } from "@/lib/schemas/google-ads";
import { sampleAdsMetrics } from "@/lib/integrations/sample";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const campaigns = await prisma.googleAdsCampaign.findMany({
    where: { organizationId: org.organizationId },
    include: { client: { select: { id: true, businessName: true } } },
    orderBy: { spend: "desc" },
    take: 300,
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = adsCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Unknown client" }, { status: 400 });
    }
  }

  const dupe = await prisma.googleAdsCampaign.findUnique({
    where: { campaignId: data.campaignId },
    select: { id: true },
  });
  if (dupe) {
    return NextResponse.json(
      { error: "A campaign with that ID already exists." },
      { status: 409 },
    );
  }

  const m = sampleAdsMetrics(data.campaignId);
  const campaign = await prisma.googleAdsCampaign.create({
    data: {
      organizationId: org.organizationId,
      clientId: data.clientId ?? null,
      campaignId: data.campaignId,
      campaignName: data.campaignName,
      status: data.status,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      costPerConv: m.costPerConv,
      lastSyncAt: new Date(),
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "ads.create",
    entity: "GoogleAdsCampaign",
    entityId: campaign.id,
  });

  return NextResponse.json({ campaign });
}
