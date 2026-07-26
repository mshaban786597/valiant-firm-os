import { DealStage } from "@prisma/client";

/**
 * Pure pipeline math and deal-stage helpers. No DB access — operates on plain
 * deal shapes so it can be unit-tested and reused by the pipeline dashboard.
 */

/** Default win-probability by stage (percent), used when a deal has no override. */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
  [DealStage.Outreach]: 10,
  [DealStage.Replied]: 25,
  [DealStage.CallBooked]: 40,
  [DealStage.ProposalSent]: 60,
  [DealStage.Negotiation]: 80,
  [DealStage.ClosedWon]: 100,
  [DealStage.ClosedLost]: 0,
};

/** Ordered forward progression of open stages. */
export const STAGE_ORDER: DealStage[] = [
  DealStage.Outreach,
  DealStage.Replied,
  DealStage.CallBooked,
  DealStage.ProposalSent,
  DealStage.Negotiation,
  DealStage.ClosedWon,
];

export function isWonStage(stage: DealStage): boolean {
  return stage === DealStage.ClosedWon;
}

export function isLostStage(stage: DealStage): boolean {
  return stage === DealStage.ClosedLost;
}

export function isClosedStage(stage: DealStage): boolean {
  return isWonStage(stage) || isLostStage(stage);
}

export interface DealLike {
  stage: DealStage;
  proposalValue?: number | null;
  closeProbability?: number | null;
}

/** Effective win probability (0–1): explicit override wins, else stage default. */
export function winProbability(deal: DealLike): number {
  const pct =
    deal.closeProbability ?? STAGE_PROBABILITY[deal.stage] ?? 0;
  return Math.min(100, Math.max(0, pct)) / 100;
}

/**
 * Probability-weighted value of open deals. Closed-lost contribute nothing;
 * closed-won contribute their full value.
 */
export function weightedPipelineValue(deals: DealLike[]): number {
  return deals.reduce((sum, deal) => {
    if (isLostStage(deal.stage)) return sum;
    const value = deal.proposalValue ?? 0;
    return sum + value * winProbability(deal);
  }, 0);
}

/** Total value of open (not closed) deals at face value. */
export function openPipelineValue(deals: DealLike[]): number {
  return deals.reduce((sum, deal) => {
    if (isClosedStage(deal.stage)) return sum;
    return sum + (deal.proposalValue ?? 0);
  }, 0);
}
