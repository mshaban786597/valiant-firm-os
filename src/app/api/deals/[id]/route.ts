import {
  ClientStatus,
  DealStage,
  LeadStatus,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { ensureOnboardingChecklist } from "@/lib/onboarding";
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

  const closedNow =
    parsed.data.stage === DealStage.ClosedWon &&
    existing.stage !== DealStage.ClosedWon;

  if (closedNow) {
    const client = await prisma.client.create({
      data: {
        organizationId: org.organizationId,
        businessName: existing.businessName,
        primaryContact: existing.contactName,
        email: existing.lead?.email,
        phone: existing.lead?.phone,
        websiteUrl: existing.lead?.websiteUrl,
        servicePurchased: existing.serviceInterest ?? "Local SEO",
        monthlyValue: existing.monthlyValue ?? undefined,
        contractStart: new Date(),
        status: ClientStatus.Onboarding,
        targetLocations: [],
        targetServices: [],
      },
    });

    await ensureOnboardingChecklist(org.organizationId, client.id);

    if (existing.leadId) {
      await prisma.lead.update({
        where: { id: existing.leadId },
        data: { status: LeadStatus.ClosedWon },
      });
    }

    // Fire onboarding automations for the freshly-won client (best-effort).
    await runTrigger("deal_won", {
      organizationId: org.organizationId,
      userId: org.userId,
      dealId: deal.id,
      clientId: client.id,
      payload: { businessName: existing.businessName },
    }).catch(() => {});
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
