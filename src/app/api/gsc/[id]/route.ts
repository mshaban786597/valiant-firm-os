import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gscUpdateSchema } from "@/lib/schemas/gsc";
import { sampleGscInsights } from "@/lib/integrations/sample";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.gscProperty.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: {
      client: {
        select: { servicePurchased: true, targetLocations: true },
      },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = gscUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.action === "refresh") {
    // No OAuth configured → deterministic sample sync of top queries.
    const niche = existing.client?.servicePurchased ?? "services";
    const city = existing.client?.targetLocations?.[0] ?? "your area";
    const insights = sampleGscInsights(existing.siteUrl, niche, city);

    await prisma.$transaction([
      prisma.gscKeyword.deleteMany({ where: { propertyId: existing.id } }),
      prisma.gscKeyword.createMany({
        data: insights.keywords.map((k) => ({
          propertyId: existing.id,
          query: k.query,
          clicks: k.clicks,
          impressions: k.impressions,
          ctr: k.ctr,
          position: k.position,
        })),
      }),
      prisma.gscProperty.update({
        where: { id: existing.id },
        data: {
          clicks28d: insights.clicks28d,
          impressions28d: insights.impressions28d,
          avgPosition: insights.avgPosition,
          lastSyncAt: new Date(),
        },
      }),
    ]);
  } else {
    const data: Record<string, unknown> = {};
    if (parsed.data.verified !== undefined) data.verified = parsed.data.verified;
    if (parsed.data.clientId !== undefined) data.clientId = parsed.data.clientId;
    if (Object.keys(data).length) {
      await prisma.gscProperty.update({ where: { id: existing.id }, data });
    }
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: parsed.data.action === "refresh" ? "gsc.refresh" : "gsc.update",
    entity: "GscProperty",
    entityId: existing.id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.gscProperty.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.gscProperty.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "gsc.delete",
    entity: "GscProperty",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
