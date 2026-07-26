import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  status: z.string().min(1),
  lastRun: z.string().datetime().nullable().optional(),
  successCount: z.number().int().optional(),
  failureCount: z.number().int().optional(),
  errorMessage: z.string().nullable().optional(),
  connectedTools: z.array(z.string()).optional(),
});

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const logs = await prisma.automationLog.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  return NextResponse.json({ automations: logs });
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

  const log = await prisma.automationLog.create({
    data: {
      organizationId: org.organizationId,
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      status: parsed.data.status,
      lastRun: parsed.data.lastRun ? new Date(parsed.data.lastRun) : undefined,
      successCount: parsed.data.successCount ?? 0,
      failureCount: parsed.data.failureCount ?? 0,
      errorMessage: parsed.data.errorMessage,
      connectedTools: parsed.data.connectedTools ?? [],
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "automation.create",
    entity: "AutomationLog",
    entityId: log.id,
  });

  return NextResponse.json({ automation: log });
}
