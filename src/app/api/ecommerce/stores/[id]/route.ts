import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { storeUpdateSchema } from "@/lib/schemas/ecommerce";
import { sampleStoreDayMetric } from "@/lib/integrations/sample";

const DAY = 86_400_000;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const store = await prisma.ecommerceStore.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: {
      client: { select: { id: true, businessName: true } },
      products: { orderBy: { priceCents: "desc" }, take: 100 },
      orders: { orderBy: { placedAt: "desc" }, take: 50 },
      metrics: { orderBy: { date: "asc" }, take: 60 },
    },
  });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ store });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("ecommerce.write");
  if (!org.ok) return org.response;

  const existing = await prisma.ecommerceStore.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = storeUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const d = parsed.data;

  if (d.action === "refresh") {
    // No marketplace API connected → regenerate deterministic sample metrics.
    const now = Date.now();
    const seed = `${existing.id}:${now}`;
    await prisma.$transaction([
      prisma.ecommerceMetric.deleteMany({ where: { storeId: existing.id } }),
      prisma.ecommerceMetric.createMany({
        data: Array.from({ length: 30 }, (_, dayIndex) => {
          const m = sampleStoreDayMetric(seed, dayIndex);
          const date = new Date(now - dayIndex * DAY);
          date.setHours(0, 0, 0, 0);
          return {
            organizationId: org.organizationId,
            storeId: existing.id,
            date,
            revenueCents: m.revenueCents,
            orders: m.orders,
            units: m.units,
            sessions: m.sessions,
            conversionRate: m.conversionRate,
          };
        }),
      }),
      prisma.ecommerceStore.update({
        where: { id: existing.id },
        data: { lastSyncAt: new Date() },
      }),
    ]);
  } else {
    const data: Record<string, unknown> = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.storeUrl !== undefined) data.storeUrl = d.storeUrl;
    if (d.status !== undefined) data.status = d.status;
    if (d.clientId !== undefined) data.clientId = d.clientId;
    if (Object.keys(data).length) {
      await prisma.ecommerceStore.update({ where: { id: existing.id }, data });
    }
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: d.action === "refresh" ? "ecommerce_store.refresh" : "ecommerce_store.update",
    entity: "EcommerceStore",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("ecommerce.write");
  if (!org.ok) return org.response;

  const existing = await prisma.ecommerceStore.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Products / orders / metrics cascade via the schema relations.
  await prisma.ecommerceStore.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "ecommerce_store.delete",
    entity: "EcommerceStore",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
