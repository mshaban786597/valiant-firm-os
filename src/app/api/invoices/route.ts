import { InvoiceStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { invoiceCreateSchema } from "@/lib/schemas/invoice";
import { fromCents, invoiceTotals } from "@/lib/money";

export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as InvoiceStatus | null;
  const clientId = searchParams.get("clientId");

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: org.organizationId,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { id: true, businessName: true } },
      _count: { select: { lineItems: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ invoices });
}

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = invoiceCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // If a client is supplied, it must belong to the caller's org (tenant guard).
  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Unknown client" }, { status: 400 });
    }
  }

  const totals = invoiceTotals(
    data.lineItems.map((li) => ({ unitCents: li.unitCents, quantity: li.quantity })),
    { discountPercent: data.discountRate, taxPercent: data.taxRate },
  );

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: org.organizationId,
      clientId: data.clientId ?? null,
      number: data.number ?? null,
      currency: data.currency,
      status: InvoiceStatus.Draft,
      subtotalCents: totals.subtotalCents,
      discountRate: data.discountRate,
      discountCents: totals.discountCents,
      taxRate: data.taxRate,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      amount: new Prisma.Decimal(fromCents(totals.totalCents).toFixed(2)),
      paymentMethod: data.paymentMethod ?? null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      notes: data.notes ?? null,
      lineItems: {
        create: data.lineItems.map((li, i) => ({
          organizationId: org.organizationId,
          description: li.description,
          quantity: li.quantity,
          unitCents: li.unitCents,
          sortOrder: i,
        })),
      },
    },
    include: { lineItems: true },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "invoice.create",
    entity: "Invoice",
    entityId: invoice.id,
    meta: { totalCents: totals.totalCents, lineItems: data.lineItems.length },
  });

  return NextResponse.json({ invoice });
}
