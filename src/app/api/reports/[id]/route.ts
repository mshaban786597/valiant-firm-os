import { ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z
  .object({
    clientId: z.string().optional(),
    month: z.string().optional(),
    status: z.nativeEnum(ReportStatus).optional(),
    organicSessions: z.number().int().nullable().optional(),
    organicLeads: z.number().int().nullable().optional(),
    keywordGrowth: z.number().int().nullable().optional(),
    backlinkGrowth: z.number().int().nullable().optional(),
    gbpCalls: z.number().int().nullable().optional(),
    gbpViews: z.number().int().nullable().optional(),
    contentPublished: z.number().int().nullable().optional(),
    tasksCompleted: z.number().int().nullable().optional(),
    issuesFixed: z.number().int().nullable().optional(),
    reportSummary: z.string().nullable().optional(),
    nextMonthPlan: z.string().nullable().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const report = await prisma.report.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: { client: { select: { businessName: true } } },
  });

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report });
}

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

  const existing = await prisma.report.findFirst({
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

  const report = await prisma.report.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "report.update",
    entity: "Report",
    entityId: report.id,
  });

  return NextResponse.json({ report });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.report.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.report.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "report.delete",
    entity: "Report",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
