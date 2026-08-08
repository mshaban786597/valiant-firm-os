import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { storeCreateSchema } from "@/lib/schemas/ecommerce";
import {
  sampleStoreDayMetric,
  sampleStoreOrders,
  sampleStoreProducts,
} from "@/lib/integrations/sample";

const DAY = 86_400_000;

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const stores = await prisma.ecommerceStore.findMany({
    where: { organizationId: org.organizationId },
    include: {
      client: { select: { id: true, businessName: true } },
      _count: { select: { products: true, orders: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ stores });
}

export async function POST(req: Request) {
  const org = await requirePermission("ecommerce.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = storeCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: d.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });
  }

  const store = await prisma.ecommerceStore.create({
    data: {
      organizationId: org.organizationId,
      clientId: d.clientId ?? null,
      platform: d.platform,
      name: d.name,
      storeUrl: d.storeUrl ?? null,
      externalId: d.externalId ?? null,
      currency: d.currency,
      lastSyncAt: new Date(),
    },
  });

  // Seed deterministic sample data so the store dashboard isn't empty until a
  // real marketplace API is connected. Seeded from the store id.
  const seed = store.id;
  const now = Date.now();

  await prisma.ecommerceProduct.createMany({
    data: sampleStoreProducts(seed).map((p) => ({
      organizationId: org.organizationId,
      storeId: store.id,
      title: p.title,
      sku: p.sku,
      priceCents: p.priceCents,
      currency: store.currency,
      inventory: p.inventory,
      status: p.status,
    })),
  });

  await prisma.ecommerceOrder.createMany({
    data: sampleStoreOrders(seed).map((o) => ({
      organizationId: org.organizationId,
      storeId: store.id,
      totalCents: o.totalCents,
      currency: store.currency,
      itemCount: o.itemCount,
      status: o.status,
      placedAt: new Date(now - o.dayOffset * DAY),
    })),
  });

  await prisma.ecommerceMetric.createMany({
    data: Array.from({ length: 30 }, (_, dayIndex) => {
      const m = sampleStoreDayMetric(seed, dayIndex);
      const date = new Date(now - dayIndex * DAY);
      date.setHours(0, 0, 0, 0);
      return {
        organizationId: org.organizationId,
        storeId: store.id,
        date,
        revenueCents: m.revenueCents,
        orders: m.orders,
        units: m.units,
        sessions: m.sessions,
        conversionRate: m.conversionRate,
      };
    }),
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "ecommerce_store.create",
    entity: "EcommerceStore",
    entityId: store.id,
    meta: { platform: store.platform },
  });

  return NextResponse.json({ store });
}
