import { DealStage } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  leadId: z.string().nullable().optional(),
  businessName: z.string().min(1),
  contactName: z.string().nullable().optional(),
  serviceInterest: z.string().nullable().optional(),
  proposalValue: z.number().nullable().optional(),
  monthlyValue: z.number().nullable().optional(),
  stage: z.nativeEnum(DealStage).optional(),
  closeProbability: z.number().int().nullable().optional(),
  callDate: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const deals = await prisma.deal.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });

  return NextResponse.json({ deals });
}

export async function POST(req: Request) {
  const org = await requirePermission("deal.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: parsed.data.leadId, organizationId: org.organizationId },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 400 });
    }
  }

  const deal = await prisma.deal.create({
    data: {
      organizationId: org.organizationId,
      leadId: parsed.data.leadId ?? undefined,
      businessName: parsed.data.businessName,
      contactName: parsed.data.contactName,
      serviceInterest: parsed.data.serviceInterest,
      proposalValue: parsed.data.proposalValue ?? undefined,
      monthlyValue: parsed.data.monthlyValue ?? undefined,
      stage: parsed.data.stage ?? DealStage.Outreach,
      closeProbability: parsed.data.closeProbability ?? undefined,
      callDate: parsed.data.callDate ? new Date(parsed.data.callDate) : undefined,
      notes: parsed.data.notes,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "deal.create",
    entity: "Deal",
    entityId: deal.id,
  });

  return NextResponse.json({ deal });
}
