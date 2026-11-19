import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getDataScope } from "@/lib/scope";
import { expenseCreateSchema } from "@/lib/schemas/expenses";

export async function GET() {
  const org = await requirePermission("expense.read");
  if (!org.ok) return org.response;
  const expenses = await prisma.expense.findMany({
    where: { organizationId: org.organizationId, isDemo: getDataScope().isDemo },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 500,
  });
  return NextResponse.json({ expenses });
}

export async function POST(req: Request) {
  const org = await requirePermission("expense.write");
  if (!org.ok) return org.response;

  const parsed = expenseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const expense = await prisma.expense.create({
    data: {
      organizationId: org.organizationId,
      isDemo: getDataScope().isDemo,
      name: d.name,
      vendor: d.vendor ?? null,
      category: d.category,
      billingCycle: d.billingCycle,
      amountCents: d.amountCents ?? null,
      plannedLowCents: d.plannedLowCents ?? null,
      plannedHighCents: d.plannedHighCents ?? null,
      status: d.status,
      renewsOn: d.renewsOn ? new Date(d.renewsOn) : null,
      notes: d.notes ?? null,
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "expense.create",
    entity: "Expense",
    entityId: expense.id,
  });
  return NextResponse.json({ expense });
}
