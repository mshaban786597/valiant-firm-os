import { TaskPriority, TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z
  .object({
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    owner: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    serviceType: z.string().optional(),
    clientId: z.string().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.task.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: org.organizationId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 400 });
    }
  }

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      dueDate:
        parsed.data.dueDate === undefined
          ? undefined
          : parsed.data.dueDate === null
            ? null
            : new Date(parsed.data.dueDate),
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "task.update",
    entity: "Task",
    entityId: task.id,
    meta: { status: task.status },
  });

  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.task.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.task.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "task.delete",
    entity: "Task",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
