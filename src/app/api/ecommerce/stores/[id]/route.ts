import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { storeUpdateSchema } from "@/lib/schemas/ecommerce";


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
    return NextResponse.json(
      { error: "This store is not connected to its marketplace yet, so there is nothing to sync. No numbers were changed." },
      { status: 409 },
    );
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
