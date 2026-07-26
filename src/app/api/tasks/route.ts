import { TaskPriority, TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  clientId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  serviceType: z.string(),
  owner: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  sopLink: z.string().nullable().optional(),
  weekLabel: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") ?? undefined;

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: org.organizationId,
      ...(clientId ? { clientId } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: { client: { select: { businessName: true } } },
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, organizationId: org.organizationId },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      organizationId: org.organizationId,
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      description: parsed.data.description,
      serviceType: parsed.data.serviceType,
      owner: parsed.data.owner,
      priority: parsed.data.priority ?? TaskPriority.Medium,
      status: parsed.data.status ?? TaskStatus.Backlog,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      estimatedHours: parsed.data.estimatedHours ?? undefined,
      sopLink: parsed.data.sopLink,
      weekLabel: parsed.data.weekLabel,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "task.create",
    entity: "Task",
    entityId: task.id,
  });

  return NextResponse.json({ task });
}
