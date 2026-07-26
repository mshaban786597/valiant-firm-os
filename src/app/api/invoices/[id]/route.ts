import { InvoiceStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { invoiceUpdateSchema } from "@/lib/schemas/invoice";
import { INVOICE_TRANSITIONS, canTransition } from "@/lib/status";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: {
      client: { select: { id: true, businessName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ invoice });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = invoiceUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: {
    status?: InvoiceStatus;
    paymentMethod?: string | null;
    notes?: string | null;
    issuedAt?: Date;
    paidAt?: Date;
  } = {};

  if (parsed.data.status) {
    const next = parsed.data.status as InvoiceStatus;
    if (!canTransition(INVOICE_TRANSITIONS, existing.status, next)) {
      return NextResponse.json(
        { error: `Illegal status transition ${existing.status} → ${next}` },
        { status: 409 },
      );
    }
    patch.status = next;
    if (next === InvoiceStatus.Open) patch.issuedAt = new Date();
    if (next === InvoiceStatus.Paid) patch.paidAt = new Date();
  }
  if (parsed.data.paymentMethod !== undefined) {
    patch.paymentMethod = parsed.data.paymentMethod;
  }
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: patch,
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "invoice.update",
    entity: "Invoice",
    entityId: invoice.id,
    meta: { status: invoice.status },
  });

  return NextResponse.json({ invoice });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Only draft invoices can be hard-deleted; issued ones must be voided.
  if (existing.status !== InvoiceStatus.Draft) {
    return NextResponse.json(
      { error: "Only draft invoices can be deleted; void issued invoices instead." },
      { status: 409 },
    );
  }

  await prisma.invoice.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "invoice.delete",
    entity: "Invoice",
    entityId: existing.id,
  });

  return NextResponse.json({ ok: true });
}
