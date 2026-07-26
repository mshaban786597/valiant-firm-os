import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { workflowCreateSchema } from "@/lib/automations/types";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const workflows = await prisma.workflow.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ workflows });
}

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = workflowCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const workflow = await prisma.workflow.create({
    data: {
      organizationId: org.organizationId,
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      actions: parsed.data.actions as unknown as Prisma.InputJsonValue,
      enabled: parsed.data.enabled,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "workflow.create",
    entity: "Workflow",
    entityId: workflow.id,
    meta: { trigger: workflow.trigger, actions: parsed.data.actions.length },
  });

  return NextResponse.json({ workflow });
}
