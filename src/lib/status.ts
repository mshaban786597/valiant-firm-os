import {
  ClientStatus,
  DealStage,
  LeadStatus,
  ReportStatus,
} from "@prisma/client";

/**
 * Declarative state machines for the app's core lifecycle enums. Routes call
 * `canTransition(map, from, to)` before persisting a status change so invalid
 * jumps (e.g. a Sent report back to Draft, or a Churned client to Active) are
 * rejected consistently instead of relying on scattered ad-hoc checks.
 */

export type TransitionMap<T extends string> = Record<T, readonly T[]>;

export function canTransition<T extends string>(
  map: TransitionMap<T>,
  from: T,
  to: T,
): boolean {
  if (from === to) return true;
  return map[from]?.includes(to) ?? false;
}

export function nextStates<T extends string>(
  map: TransitionMap<T>,
  from: T,
): readonly T[] {
  return map[from] ?? [];
}

// Lead: raw → qualified → outreach → sequence → replied → booked → proposal →
// won/lost, with archive reachable from most non-terminal states.
export const LEAD_TRANSITIONS: TransitionMap<LeadStatus> = {
  [LeadStatus.Raw]: [LeadStatus.Qualified, LeadStatus.Archived],
  [LeadStatus.Qualified]: [LeadStatus.OutreachQueue, LeadStatus.Archived],
  [LeadStatus.OutreachQueue]: [LeadStatus.InSequence, LeadStatus.Archived],
  [LeadStatus.InSequence]: [
    LeadStatus.Replied,
    LeadStatus.Archived,
    LeadStatus.ClosedLost,
  ],
  [LeadStatus.Replied]: [
    LeadStatus.CallBooked,
    LeadStatus.ClosedLost,
    LeadStatus.Archived,
  ],
  [LeadStatus.CallBooked]: [
    LeadStatus.ProposalSent,
    LeadStatus.ClosedLost,
    LeadStatus.Archived,
  ],
  [LeadStatus.ProposalSent]: [
    LeadStatus.ClosedWon,
    LeadStatus.ClosedLost,
    LeadStatus.Archived,
  ],
  [LeadStatus.ClosedWon]: [],
  [LeadStatus.ClosedLost]: [LeadStatus.Archived],
  [LeadStatus.Archived]: [LeadStatus.Raw],
};

// Deal stages progress forward and can drop to ClosedLost from any open stage.
export const DEAL_TRANSITIONS: TransitionMap<DealStage> = {
  [DealStage.Outreach]: [DealStage.Replied, DealStage.ClosedLost],
  [DealStage.Replied]: [DealStage.CallBooked, DealStage.ClosedLost],
  [DealStage.CallBooked]: [DealStage.ProposalSent, DealStage.ClosedLost],
  [DealStage.ProposalSent]: [
    DealStage.Negotiation,
    DealStage.ClosedWon,
    DealStage.ClosedLost,
  ],
  [DealStage.Negotiation]: [DealStage.ClosedWon, DealStage.ClosedLost],
  [DealStage.ClosedWon]: [],
  [DealStage.ClosedLost]: [],
};

// Client lifecycle: onboarding → active ↔ at-risk/paused → churned (terminal,
// but reactivation to Onboarding is allowed for returning clients).
export const CLIENT_TRANSITIONS: TransitionMap<ClientStatus> = {
  [ClientStatus.Onboarding]: [ClientStatus.Active, ClientStatus.Churned],
  [ClientStatus.Active]: [
    ClientStatus.AtRisk,
    ClientStatus.Paused,
    ClientStatus.Churned,
  ],
  [ClientStatus.AtRisk]: [
    ClientStatus.Active,
    ClientStatus.Paused,
    ClientStatus.Churned,
  ],
  [ClientStatus.Paused]: [ClientStatus.Active, ClientStatus.Churned],
  [ClientStatus.Churned]: [ClientStatus.Onboarding],
};

// Report QA flow: draft → QA → sent (sent is terminal). QA can bounce to draft.
export const REPORT_TRANSITIONS: TransitionMap<ReportStatus> = {
  [ReportStatus.Draft]: [ReportStatus.QA],
  [ReportStatus.QA]: [ReportStatus.Draft, ReportStatus.Sent],
  [ReportStatus.Sent]: [],
};
