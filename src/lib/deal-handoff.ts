import { ClientStatus, LeadStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureOnboardingChecklist } from "@/lib/onboarding";

/**
 * Deal Won → client/onboarding handoff (G05).
 *
 * Concurrency-safe and idempotent. The invariant "one client per won deal" is
 * enforced at the database level via an atomic compare-and-set on the unique
 * `Deal.clientId` column:
 *
 *   1. Fast path — if the deal is already linked to a client, do nothing.
 *   2. Otherwise create the client, then atomically claim the deal with
 *      `updateMany({ where: { id, clientId: null } })`. Exactly one concurrent
 *      writer gets `count === 1`; the rest get `count === 0`, roll back their
 *      orphan client, and return the winner's clientId.
 *
 * Replaying Deal Won (sequentially or concurrently) therefore always yields a
 * single client and a single onboarding checklist.
 */
export interface DealHandoffInput {
  organizationId: string;
  deal: {
    id: string;
    businessName: string;
    contactName: string | null;
    serviceInterest: string | null;
    monthlyValue: Prisma.Decimal | null;
    leadId: string | null;
    clientId: string | null;
  };
  lead?: { email: string | null; phone: string | null; websiteUrl: string | null } | null;
}

export interface DealHandoffResult {
  created: boolean;
  clientId: string | null;
  reason?: "already-linked" | "race-lost" | "created";
}

export async function completeDealWonHandoff(
  input: DealHandoffInput,
): Promise<DealHandoffResult> {
  const { organizationId, deal, lead } = input;

  // 1. Fast idempotency path: this deal already produced a client.
  if (deal.clientId) {
    return { created: false, clientId: deal.clientId, reason: "already-linked" };
  }

  // 2. Create the prospective client.
  const client = await prisma.client.create({
    data: {
      organizationId,
      businessName: deal.businessName,
      primaryContact: deal.contactName,
      email: lead?.email ?? undefined,
      phone: lead?.phone ?? undefined,
      websiteUrl: lead?.websiteUrl ?? undefined,
      servicePurchased: deal.serviceInterest ?? "Local SEO",
      monthlyValue: deal.monthlyValue ?? undefined,
      contractStart: new Date(),
      status: ClientStatus.Onboarding,
      targetLocations: [],
      targetServices: [],
    },
  });

  // 3. Atomic claim — only one concurrent writer links a client to this deal.
  const claim = await prisma.deal.updateMany({
    where: { id: deal.id, clientId: null },
    data: { clientId: client.id },
  });

  if (claim.count === 0) {
    // Lost the race: roll back the orphan and return the winner's client.
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    const winner = await prisma.deal.findUnique({
      where: { id: deal.id },
      select: { clientId: true },
    });
    return { created: false, clientId: winner?.clientId ?? null, reason: "race-lost" };
  }

  // 4. Won the claim: finish the handoff (checklist is itself idempotent).
  await ensureOnboardingChecklist(organizationId, client.id);
  if (deal.leadId) {
    await prisma.lead
      .update({ where: { id: deal.leadId }, data: { status: LeadStatus.ClosedWon } })
      .catch(() => {});
  }

  return { created: true, clientId: client.id, reason: "created" };
}
