import { describe, expect, it } from "vitest";
import {
  fallbackContentBrief,
  fallbackOutreach,
  fallbackProposal,
  fallbackReportSummary,
} from "@/lib/ai/fallbacks";
import { ruleBasedLeadScore } from "@/lib/ai/rule-score";
import { ruleHealthRiskFromSignals } from "@/lib/ai/rule-health";
import { outreachOutputSchema } from "@/lib/schemas/outreach";
import { proposalOutputSchema } from "@/lib/schemas/proposal";
import { contentBriefOutputSchema } from "@/lib/schemas/content-brief";
import { reportSummaryOutputSchema } from "@/lib/schemas/report-summary";
import { leadScoreOutputSchema } from "@/lib/schemas/lead-score";
import { healthRiskOutputSchema } from "@/lib/schemas/health-risk";

const lead = {
  business_name: "Acme Plumbing",
  niche: "Plumbing",
  city: "Austin",
  state: "TX",
  gbp_status: "incomplete",
  website_status: "slow",
};

// Every AI-backed endpoint must have a deterministic fallback that returns
// schema-valid output with no network/keys present. This asserts that contract
// for all six generators at once.
describe("deterministic fallback coverage for all AI endpoints", () => {
  it("1. lead score → valid", () => {
    expect(leadScoreOutputSchema.safeParse(ruleBasedLeadScore(lead)).success).toBe(true);
  });

  it("2. outreach → valid with 3 subject lines", () => {
    const out = fallbackOutreach(lead);
    expect(outreachOutputSchema.safeParse(out).success).toBe(true);
    expect(out.subject_lines).toHaveLength(3);
    expect(out.email_1).toContain("Acme Plumbing");
  });

  it("3. proposal → valid", () => {
    const out = fallbackProposal({
      lead,
      call_notes: "wants more calls",
      business_goals: "double lead volume",
      package: "Local Growth",
      tier: "Pro",
      weaknesses: ["thin_content", "no_schema"],
      market_opportunity: "Strong seasonal demand in Austin",
    });
    expect(proposalOutputSchema.safeParse(out).success).toBe(true);
    expect(out.scope_of_work.length).toBeGreaterThan(0);
  });

  it("4. content brief → valid", () => {
    const out = fallbackContentBrief({
      title: "Emergency Plumbing in Austin",
      target_keyword: "emergency plumber austin",
      location: "Austin, TX",
      service: "Emergency Plumbing",
      client_name: "Acme Plumbing",
    });
    expect(contentBriefOutputSchema.safeParse(out).success).toBe(true);
    expect(out.target_keyword).toBe("emergency plumber austin");
  });

  it("5. report summary → valid", () => {
    const out = fallbackReportSummary({ client_name: "Acme", month: "July 2026" });
    expect(reportSummaryOutputSchema.safeParse(out).success).toBe(true);
  });

  it("6. health risk → valid", () => {
    const out = ruleHealthRiskFromSignals("Acme Plumbing", {
      rank_trend: 18,
      response_time: 15,
      payment_history: 20,
      report_engagement: 12,
      nps: 8,
      goal_progress: 10,
    });
    expect(healthRiskOutputSchema.safeParse(out).success).toBe(true);
  });
});

describe("health risk banding", () => {
  const signals = (score: number) => ({
    rank_trend: score,
    response_time: 0,
    payment_history: 0,
    report_engagement: 0,
    nps: 0,
    goal_progress: 0,
  });

  it("bands composite score correctly", () => {
    expect(ruleHealthRiskFromSignals("A", signals(85)).band).toBe("Green");
    expect(ruleHealthRiskFromSignals("A", signals(70)).band).toBe("Yellow");
    expect(ruleHealthRiskFromSignals("A", signals(50)).band).toBe("Orange");
    expect(ruleHealthRiskFromSignals("A", signals(20)).band).toBe("Red");
  });

  it("sums the six signal dimensions into the composite", () => {
    const out = ruleHealthRiskFromSignals("A", {
      rank_trend: 10,
      response_time: 10,
      payment_history: 10,
      report_engagement: 10,
      nps: 10,
      goal_progress: 10,
    });
    expect(out.composite_score).toBe(60);
  });
});
