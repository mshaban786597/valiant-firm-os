import { DealStage, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { completeDealWonHandoff } from "@/lib/deal-handoff";
import { writeAuditLog } from "@/lib/audit";
import { runTrigger } from "@/lib/automations/engine";

const patchSchema = z
  .object({
    businessName: z.string().optional(),
    contactName: z.string().nullable().optional(),
    leadId: z.string().nullable().optional(),
    serviceInterest: z.string().nullable().optional(),
    stage: z.nativeEnum(DealStage).optional(),
    notes: z.string().nullable().optional(),
    proposalDraft: z.unknown().optional(),
    closeProbability: z.number().nullable().optional(),
    lostReason: z.string().nullable().optional(),
    monthlyValue: z.number().nullable().optional(),
    proposalValue: z.number().nullable().optional(),
    callDate: z.string().datetime().nullable().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("deal.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.deal.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: { lead: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    proposalDraft,
    monthlyValue,
    proposalValue,
    callDate,
    leadId,
    ...rest
  } = parsed.data;

  if (leadId !== undefined && leadId !== null) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: org.organizationId },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 400 });
    }
  }

  const deal = await prisma.deal.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(leadId !== undefined ? { leadId } : {}),
      ...(proposalDraft !== undefined
        ? { proposalDraft: proposalDraft as Prisma.InputJsonValue }
        : {}),
      ...(monthlyValue !== undefined ? { monthlyValue } : {}),
      ...(proposalValue !== undefined ? { proposalValue } : {}),
      ...(callDate === undefined
        ? {}
        : {
            callDate: callDate === null ? null : new Date(callDate),
          }),
    },
  });

  // Deal Won → client/onboarding handoff. Concurrency-safe + idempotent:
  // only the first writer to close this deal creates exactly one client +
  // onboarding set (see completeDealWonHandoff).
  if (parsed.data.stage === DealStage.ClosedWon) {
    const handoff = await completeDealWonHandoff({
      organizationId: org.organizationId,
      deal: {
        id: existing.id,
        businessName: existing.businessName,
        contactName: existing.contactName,
        serviceInterest: existing.serviceInterest,
        monthlyValue: existing.monthlyValue,
        leadId: existing.leadId,
        clientId: existing.clientId,
      },
      lead: existing.lead
        ? {
            email: existing.lead.email,
            phone: existing.lead.phone,
            websiteUrl: existing.lead.websiteUrl,
          }
        : null,
    });

    // Fire onboarding automations only when a client was actually created.
    if (handoff.created && handoff.clientId) {
      await runTrigger("deal_won", {
        organizationId: org.organizationId,
        userId: org.userId,
        dealId: deal.id,
        clientId: handoff.clientId,
        payload: { businessName: existing.businessName },
      }).catch(() => {});
    }
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "deal.update",
    entity: "Deal",
    entityId: deal.id,
    meta: { stage: deal.stage },
  });

  return NextResponse.json({ deal });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("deal.write");
  if (!org.ok) return org.response;

  const existing = await prisma.deal.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.deal.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "deal.delete",
    entity: "Deal",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
