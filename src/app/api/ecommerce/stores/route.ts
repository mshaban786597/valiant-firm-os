import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { storeCreateSchema } from "@/lib/schemas/ecommerce";


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
    },
  });

  // Products, orders and sales stay empty until the store's API is connected.

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
