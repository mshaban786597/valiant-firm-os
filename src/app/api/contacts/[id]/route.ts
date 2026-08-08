import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { contactUpdateSchema } from "@/lib/schemas/contact";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: { client: { select: { id: true, businessName: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ contact });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("contact.write");
  if (!org.ok) return org.response;

  const existing = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = contactUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const d = parsed.data;
  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.email !== undefined ? { email: d.email } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.role !== undefined ? { role: d.role } : {}),
      ...(d.source !== undefined ? { source: d.source } : {}),
      ...(d.tags !== undefined ? { tags: d.tags } : {}),
      ...(d.clientId !== undefined ? { clientId: d.clientId } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.lastContactedAt !== undefined
        ? { lastContactedAt: d.lastContactedAt ? new Date(d.lastContactedAt) : null }
        : {}),
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "contact.update",
    entity: "Contact",
    entityId: contact.id,
  });
  return NextResponse.json({ contact });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("contact.write");
  if (!org.ok) return org.response;

  const existing = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contact.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "contact.delete",
    entity: "Contact",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
