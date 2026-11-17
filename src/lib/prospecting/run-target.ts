import { prisma } from "@/lib/prisma";
import { googleCseProvider, runProspecting, type ProspectingOutcome, type SerpProvider } from "@/lib/prospecting/agent";
import { queueOutreachDraft } from "@/lib/prospecting/drafts";

export interface TargetRunResult extends ProspectingOutcome {
  drafted: number;
  noEmail: number;
}

/**
 * Run one saved search, then write a draft for every new prospect that has a
 * published email. Drafts wait in Review & Approvals; nothing is sent.
 */
export async function runProspectTarget(
  target: { id: string; organizationId: string; niche: string; keyword: string; city: string; state: string; isDemo: boolean },
  opts: { provider?: SerpProvider | null; requestedBy?: string | null; maxNew?: number; observedAt?: Date } = {},
): Promise<TargetRunResult> {
  const provider = opts.provider === undefined ? googleCseProvider() : opts.provider;
  const outcome = await runProspecting({
    organizationId: target.organizationId,
    niche: target.niche,
    keyword: target.keyword,
    city: target.city,
    state: target.state,
    provider,
    targetId: target.id,
    isDemo: target.isDemo,
    maxNew: opts.maxNew,
    observedAt: opts.observedAt,
  });

  let drafted = 0;
  let noEmail = 0;
  for (const lead of outcome.added) {
    if (!lead.email) {
      noEmail += 1;
      continue;
    }
    const r = await queueOutreachDraft({
      organizationId: target.organizationId,
      leadId: lead.leadId,
      requestedBy: opts.requestedBy ?? null,
      requireEmail: true,
    });
    if (r.ok && r.created) drafted += 1;
  }
  return { ...outcome, drafted, noEmail };
}

/** The active live target that has waited longest since its last run. */
export async function nextDueTarget(minHoursBetweenRuns = 24 * 7, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - minHoursBetweenRuns * 3_600_000);
  return prisma.prospectTarget.findFirst({
    where: { active: true, isDemo: false, OR: [{ lastRunAt: null }, { lastRunAt: { lt: cutoff } }] },
    orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
}
