import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { campaignUpdateSchema } from "@/lib/schemas/campaign";
import { toCents } from "@/lib/money";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("campaign.write");
  if (!org.ok) return org.response;

  const existing = await prisma.campaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = campaignUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const d = parsed.data;

  const campaign = await prisma.campaign.update({
    where: { id: existing.id },
    data: {
      ...(d.channel !== undefined ? { channel: d.channel } : {}),
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.budgetDollars !== undefined ? { budgetCents: toCents(d.budgetDollars) } : {}),
      ...(d.goals !== undefined ? { goals: d.goals } : {}),
      ...(d.managerId !== undefined ? { managerId: d.managerId } : {}),
      ...(d.startDate !== undefined
        ? { startDate: d.startDate ? new Date(d.startDate) : null }
        : {}),
      ...(d.endDate !== undefined
        ? { endDate: d.endDate ? new Date(d.endDate) : null }
        : {}),
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "campaign.update",
    entity: "Campaign",
    entityId: campaign.id,
  });
  return NextResponse.json({ campaign });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("campaign.write");
  if (!org.ok) return org.response;

  const existing = await prisma.campaign.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.campaign.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "campaign.delete",
    entity: "Campaign",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
