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
  /** A fixture deal creates a fixture client. */
  isDemo?: boolean;
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
      isDemo: input.isDemo ?? false,
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

const BASELINE_TITLE = "Baseline audit";

/**
 * Carry the sales context into delivery: one baseline audit task holding the
 * agreed scope, the prospect evidence and the meeting summary, and the lead's
 * confirmed meetings re-linked to the client. Idempotent: a second call finds
 * the existing task and creates nothing.
 */
export async function attachHandoffContext(input: {
  organizationId: string;
  clientId: string;
  leadId: string | null;
  agreedScope: string | null;
  owner?: string | null;
  isDemo?: boolean;
}): Promise<{ taskId: string; created: boolean; evidenceCarried: number; meetingCarried: boolean }> {
  const existing = await prisma.task.findFirst({
    where: { organizationId: input.organizationId, clientId: input.clientId, serviceType: "Onboarding", title: { startsWith: BASELINE_TITLE } },
    select: { id: true },
  });

  const [evidence, meeting] = input.leadId
    ? await Promise.all([
        prisma.leadEvidence.findMany({ where: { leadId: input.leadId }, orderBy: { observedAt: "asc" } }),
        prisma.meeting.findFirst({
          where: { leadId: input.leadId, status: { in: ["confirmed", "rescheduled", "attended"] } },
          orderBy: { startsAt: "desc" },
        }),
      ])
    : [[], null];

  if (existing) {
    return { taskId: existing.id, created: false, evidenceCarried: evidence.length, meetingCarried: !!meeting };
  }

  const lines = [
    `Agreed scope: ${input.agreedScope ?? "not recorded"}`,
    "",
    "Prospect evidence carried over from sales:",
    ...(evidence.length
      ? evidence.map(
          (e) =>
            `- [${e.surface ?? e.kind}${e.isFixture ? ", fixture" : ""}] ${e.finding}` +
            (e.query ? ` (query "${e.query}"${e.location ? `, ${e.location}` : ""}, ${e.provider}, ${e.observedAt.toISOString().slice(0, 10)})` : ""),
        )
      : ["- none recorded"]),
    "",
    `Meeting summary: ${meeting?.summary ?? "no confirmed meeting on record"}`,
  ];

  const task = await prisma.task.create({
    data: {
      organizationId: input.organizationId,
      clientId: input.clientId,
      title: `${BASELINE_TITLE}: capture starting rankings, traffic and lead routes`,
      description: lines.join("\n"),
      serviceType: "Onboarding",
      owner: input.owner ?? null,
      priority: "High",
      isDemo: input.isDemo ?? false,
    },
  });
  if (input.leadId) {
    await prisma.meeting.updateMany({
      where: { leadId: input.leadId, clientId: null },
      data: { clientId: input.clientId },
    });
  }
  return { taskId: task.id, created: true, evidenceCarried: evidence.length, meetingCarried: !!meeting };
}
