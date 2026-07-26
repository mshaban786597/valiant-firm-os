import { describe, expect, it } from "vitest";
import { DealStage } from "@prisma/client";
import {
  STAGE_PROBABILITY,
  isClosedStage,
  isLostStage,
  isWonStage,
  openPipelineValue,
  weightedPipelineValue,
  winProbability,
} from "@/lib/deals";
import { DEAL_TRANSITIONS, canTransition, nextStates } from "@/lib/status";

describe("deal stage predicates", () => {
  it("identifies won/lost/closed stages", () => {
    expect(isWonStage(DealStage.ClosedWon)).toBe(true);
    expect(isLostStage(DealStage.ClosedLost)).toBe(true);
    expect(isClosedStage(DealStage.ClosedWon)).toBe(true);
    expect(isClosedStage(DealStage.ClosedLost)).toBe(true);
    expect(isClosedStage(DealStage.Negotiation)).toBe(false);
  });
});

describe("winProbability", () => {
  it("uses an explicit closeProbability override", () => {
    expect(winProbability({ stage: DealStage.Outreach, closeProbability: 50 })).toBe(0.5);
  });

  it("falls back to the stage default", () => {
    expect(winProbability({ stage: DealStage.Negotiation })).toBe(
      STAGE_PROBABILITY[DealStage.Negotiation] / 100,
    );
  });

  it("clamps overrides into 0..1", () => {
    expect(winProbability({ stage: DealStage.Outreach, closeProbability: 200 })).toBe(1);
    expect(winProbability({ stage: DealStage.Outreach, closeProbability: -10 })).toBe(0);
  });
});

describe("pipeline valuation", () => {
  const deals = [
    { stage: DealStage.ProposalSent, proposalValue: 10000 }, // 60% => 6000
    { stage: DealStage.Negotiation, proposalValue: 5000 }, //   80% => 4000
    { stage: DealStage.ClosedWon, proposalValue: 8000 }, //    100% => 8000
    { stage: DealStage.ClosedLost, proposalValue: 9000 }, //     excluded
  ];

  it("weights open + won deals by probability and excludes lost", () => {
    expect(weightedPipelineValue(deals)).toBe(6000 + 4000 + 8000);
  });

  it("openPipelineValue counts only not-yet-closed deals at face value", () => {
    expect(openPipelineValue(deals)).toBe(10000 + 5000);
  });

  it("handles missing values as zero", () => {
    expect(weightedPipelineValue([{ stage: DealStage.Outreach }])).toBe(0);
  });
});

describe("deal stage transitions", () => {
  it("permits forward progression", () => {
    expect(canTransition(DEAL_TRANSITIONS, DealStage.Outreach, DealStage.Replied)).toBe(true);
    expect(
      canTransition(DEAL_TRANSITIONS, DealStage.ProposalSent, DealStage.Negotiation),
    ).toBe(true);
  });

  it("allows dropping to ClosedLost from any open stage", () => {
    for (const stage of [
      DealStage.Outreach,
      DealStage.Replied,
      DealStage.CallBooked,
      DealStage.ProposalSent,
      DealStage.Negotiation,
    ]) {
      expect(canTransition(DEAL_TRANSITIONS, stage, DealStage.ClosedLost)).toBe(true);
    }
  });

  it("forbids reopening a closed deal", () => {
    expect(nextStates(DEAL_TRANSITIONS, DealStage.ClosedWon)).toHaveLength(0);
    expect(nextStates(DEAL_TRANSITIONS, DealStage.ClosedLost)).toHaveLength(0);
  });

  it("forbids skipping stages (Outreach → ClosedWon)", () => {
    expect(canTransition(DEAL_TRANSITIONS, DealStage.Outreach, DealStage.ClosedWon)).toBe(false);
  });
});
