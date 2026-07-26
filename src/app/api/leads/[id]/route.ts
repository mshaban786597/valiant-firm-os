import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const leadUpdateSchema = z
  .object({
    businessName: z.string().optional(),
    niche: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    websiteUrl: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    domainAuthority: z.number().nullable().optional(),
    reviewCount: z.number().nullable().optional(),
    starRating: z.number().nullable().optional(),
    gbpStatus: z.string().nullable().optional(),
    websiteStatus: z.string().nullable().optional(),
    weaknessTags: z.array(z.string()).optional(),
    leadScore: z.number().nullable().optional(),
    status: z.nativeEnum(LeadStatus).optional(),
    recommendedOffer: z.string().nullable().optional(),
    outreachAngle: z.string().nullable().optional(),
    manualOpened: z.boolean().optional(),
    manualReplied: z.boolean().optional(),
    manualBooked: z.boolean().optional(),
    sequenceStartedAt: z.string().datetime().nullable().optional(),
    outreachQueuedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: {
      scores: { orderBy: { createdAt: "desc" }, take: 5 },
      outreach: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = leadUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = {
    ...parsed.data,
    sequenceStartedAt: parsed.data.sequenceStartedAt
      ? new Date(parsed.data.sequenceStartedAt)
      : parsed.data.sequenceStartedAt === null
        ? null
        : undefined,
    outreachQueuedAt: parsed.data.outreachQueuedAt
      ? new Date(parsed.data.outreachQueuedAt)
      : parsed.data.outreachQueuedAt === null
        ? null
        : undefined,
  };

  const lead = await prisma.lead.updateMany({
    where: { id: params.id, organizationId: org.organizationId },
    data,
  });

  if (lead.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "lead.update",
    entity: "Lead",
    entityId: params.id,
  });

  return NextResponse.json({ lead: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.lead.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "lead.delete",
    entity: "Lead",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
