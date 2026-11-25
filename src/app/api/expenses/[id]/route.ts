import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { expenseUpdateSchema } from "@/lib/schemas/expenses";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("expense.write");
  if (!org.ok) return org.response;

  const existing = await prisma.expense.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = expenseUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const d = parsed.data;

  const low = d.plannedLowCents !== undefined ? d.plannedLowCents : existing.plannedLowCents;
  const high = d.plannedHighCents !== undefined ? d.plannedHighCents : existing.plannedHighCents;
  if (low !== null && high !== null && low > high) {
    return NextResponse.json({ error: "Planned low must not exceed planned high" }, { status: 400 });
  }

  const expense = await prisma.expense.update({
    where: { id: existing.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.vendor !== undefined ? { vendor: d.vendor } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.billingCycle !== undefined ? { billingCycle: d.billingCycle } : {}),
      ...(d.amountCents !== undefined ? { amountCents: d.amountCents } : {}),
      ...(d.plannedLowCents !== undefined ? { plannedLowCents: d.plannedLowCents } : {}),
      ...(d.plannedHighCents !== undefined ? { plannedHighCents: d.plannedHighCents } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.renewsOn !== undefined ? { renewsOn: d.renewsOn ? new Date(d.renewsOn) : null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "expense.update",
    entity: "Expense",
    entityId: expense.id,
  });
  return NextResponse.json({ expense });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("expense.write");
  if (!org.ok) return org.response;

  const existing = await prisma.expense.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.expense.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "expense.delete",
    entity: "Expense",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
