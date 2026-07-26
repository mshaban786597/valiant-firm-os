import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z
  .object({
    name: z.string().optional(),
    trigger: z.string().optional(),
    status: z.string().optional(),
    lastRun: z.string().datetime().nullable().optional(),
    successCount: z.number().int().optional(),
    failureCount: z.number().int().optional(),
    errorMessage: z.string().nullable().optional(),
    connectedTools: z.array(z.string()).optional(),
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

  const existing = await prisma.automationLog.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { lastRun, ...rest } = parsed.data;

  const automation = await prisma.automationLog.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(lastRun === undefined
        ? {}
        : { lastRun: lastRun === null ? null : new Date(lastRun) }),
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "automation.update",
    entity: "AutomationLog",
    entityId: automation.id,
  });

  return NextResponse.json({ automation });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.automationLog.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.automationLog.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "automation.delete",
    entity: "AutomationLog",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
