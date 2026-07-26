import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { workflowUpdateSchema } from "@/lib/automations/types";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("automation.write");
  if (!org.ok) return org.response;

  const existing = await prisma.workflow.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = workflowUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.trigger !== undefined) data.trigger = parsed.data.trigger;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.actions !== undefined) {
    data.actions = parsed.data.actions as unknown as Prisma.InputJsonValue;
  }

  const workflow = await prisma.workflow.update({
    where: { id: existing.id },
    data,
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "workflow.update",
    entity: "Workflow",
    entityId: workflow.id,
  });

  return NextResponse.json({ workflow });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("automation.write");
  if (!org.ok) return org.response;

  const existing = await prisma.workflow.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workflow.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "workflow.delete",
    entity: "Workflow",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
