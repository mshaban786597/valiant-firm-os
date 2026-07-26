import { ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  clientId: z.string(),
  month: z.string().min(4),
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
});

export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId")?.trim() || undefined;

  const reports = await prisma.report.findMany({
    where: {
      organizationId: org.organizationId,
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { month: "desc" },
    take: 300,
    include: { client: { select: { businessName: true } } },
  });

  return NextResponse.json({ reports });
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

  const report = await prisma.report.create({
    data: {
      organizationId: org.organizationId,
      clientId: parsed.data.clientId,
      month: parsed.data.month,
      status: parsed.data.status ?? ReportStatus.Draft,
      organicSessions: parsed.data.organicSessions ?? undefined,
      organicLeads: parsed.data.organicLeads ?? undefined,
      keywordGrowth: parsed.data.keywordGrowth ?? undefined,
      backlinkGrowth: parsed.data.backlinkGrowth ?? undefined,
      gbpCalls: parsed.data.gbpCalls ?? undefined,
      gbpViews: parsed.data.gbpViews ?? undefined,
      contentPublished: parsed.data.contentPublished ?? undefined,
      tasksCompleted: parsed.data.tasksCompleted ?? undefined,
      issuesFixed: parsed.data.issuesFixed ?? undefined,
      reportSummary: parsed.data.reportSummary,
      nextMonthPlan: parsed.data.nextMonthPlan,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "report.create",
    entity: "Report",
    entityId: report.id,
  });

  return NextResponse.json({ report });
}
