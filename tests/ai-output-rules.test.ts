import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const claudeText = vi.fn();
vi.mock("@/lib/ai/claude", async (original) => ({
  ...(await original<typeof import("@/lib/ai/claude")>()),
  claudeText: (...args: unknown[]) => claudeText(...args),
}));

import {
  CONTENT_BRIEF_OUTPUT_RULES,
  HEALTH_RISK_OUTPUT_RULES,
  OUTREACH_OUTPUT_RULES,
  PROPOSAL_OUTPUT_RULES,
  REPORT_SUMMARY_OUTPUT_RULES,
} from "@/lib/ai/output-rules";
import { LEAD_SCORE_OUTPUT_RULES, computeLeadScore } from "@/lib/ai/compute-lead-score";
import { aiContentBriefJson, aiHealthRiskJson } from "@/lib/ai/llm-json";
import { contentBriefOutputSchema } from "@/lib/schemas/content-brief";
import { healthRiskOutputSchema } from "@/lib/schemas/health-risk";
import { leadScoreOutputSchema } from "@/lib/schemas/lead-score";
import { outreachOutputSchema } from "@/lib/schemas/outreach";
import { proposalOutputSchema } from "@/lib/schemas/proposal";
import { reportSummaryOutputSchema } from "@/lib/schemas/report-summary";

const lead = { business_name: "Acme Fencing", niche: "Fencing", city: "Tallahassee", state: "FL" };

const score = {
  composite_score: 45,
  seo_weakness_score: 12,
  gbp_score: 8,
  review_velocity_score: 8,
  website_quality_score: 10,
  business_signal_score: 7,
  weakness_tags: ["gbp_status_unknown"],
  recommended_offer: "Local SEO",
  first_email_hook: "Hello",
  outreach_angle: "Local visibility",
  priority_status: "Warm Manual Review",
  reasoning_summary: "Most fields are unknown.",
};

const brief = {
  search_intent: "local",
  target_keyword: "fencing tallahassee",
  secondary_keywords: ["fence repair"],
  entity_map: ["Tallahassee"],
  heading_structure: ["H1: Fencing in Tallahassee"],
  faq_questions: ["How long does a fence take?"],
  internal_linking_recommendations: ["Link to the contact page"],
  schema_recommendation: "LocalBusiness",
  eeat_notes: "Show licences",
  local_seo_notes: "Name the service area",
  aeo_geo_notes: "Answer questions directly",
};

const ok = (value: unknown, inputTokens = 1000, outputTokens = 500) => ({
  ok: true,
  text: JSON.stringify(value),
  model: "claude-haiku-5-5",
  inputTokens,
  outputTokens,
});

beforeEach(() => {
  claudeText.mockReset();
  delete process.env.OPENAI_API_KEY;
});

describe("output rules name every key the reply is checked for", () => {
  const cases: [string, string, z.ZodObject][] = [
    ["lead score", LEAD_SCORE_OUTPUT_RULES, leadScoreOutputSchema],
    ["outreach", OUTREACH_OUTPUT_RULES, outreachOutputSchema],
    ["proposal", PROPOSAL_OUTPUT_RULES, proposalOutputSchema],
    ["content brief", CONTENT_BRIEF_OUTPUT_RULES, contentBriefOutputSchema],
    ["report summary", REPORT_SUMMARY_OUTPUT_RULES, reportSummaryOutputSchema],
    ["health risk", HEALTH_RISK_OUTPUT_RULES, healthRiskOutputSchema],
  ];
  for (const [name, rules, schema] of cases) {
    it(name, () => {
      for (const key of Object.keys(schema.shape)) expect(rules, `${name}: ${key}`).toContain(key);
      expect(rules).toMatch(/do not invent|Use only facts/i);
    });
  }

  it("health bands match the rule-based cut-offs", () => {
    expect(HEALTH_RISK_OUTPUT_RULES).toContain('"Green" when composite_score is 80 or more');
    expect(HEALTH_RISK_OUTPUT_RULES).toContain('"Yellow" from 60 to 79');
    expect(HEALTH_RISK_OUTPUT_RULES).toContain('"Orange" from 40 to 59');
    expect(HEALTH_RISK_OUTPUT_RULES).toContain('"Red" below 40');
  });
});

describe("AI replies through the chain", () => {
  it("constrains the reply to the schema and records real tokens and cost", async () => {
    claudeText.mockResolvedValue(ok(score, 1200, 300));
    const got = await computeLeadScore(lead);

    expect(got.provider).toBe("anthropic");
    expect(got.score.composite_score).toBe(45);
    expect(got.tokensUsed).toBe(1500);
    expect(got.costEstimate).toBeCloseTo(0.00027, 10);

    const call = claudeText.mock.calls[0]![0] as { user: string; effort: string; jsonSchema: { properties: Record<string, unknown> } };
    expect(call.effort).toBe("low");
    expect(call.user).toContain("seo_weakness_score: number from 0 to 25");
    expect(Object.keys(call.jsonSchema.properties).sort()).toEqual(Object.keys(leadScoreOutputSchema.shape).sort());
  });

  it("falls back to the rules, at no cost, when a score is out of range", async () => {
    claudeText.mockResolvedValue(ok({ ...score, seo_weakness_score: 45 }));
    const got = await computeLeadScore(lead);
    expect(got.provider).toBe("rules");
    expect(got.tokensUsed).toBe(0);
    expect(got.costEstimate).toBe(0);
    expect(got.score.seo_weakness_score).toBeLessThanOrEqual(25);
  });

  it("falls back to the rules when no key is set or the call fails", async () => {
    claudeText.mockResolvedValueOnce(null);
    expect((await computeLeadScore(lead)).provider).toBe("rules");
    claudeText.mockResolvedValueOnce({ ok: false, model: "claude-haiku-5-5", reason: "Anthropic rate limit reached" });
    expect((await computeLeadScore(lead)).provider).toBe("rules");
  });

  it("rejects a reply that is not valid JSON or has the wrong shape", async () => {
    claudeText.mockResolvedValueOnce({ ...ok(brief), text: '{"search_intent":"local"]}' });
    expect(await aiContentBriefJson("s", "u")).toBeNull();
    claudeText.mockResolvedValueOnce(ok({ ...brief, heading_structure: [{ level: "H1", text: "x" }] }));
    expect(await aiContentBriefJson("s", "u")).toBeNull();
    claudeText.mockResolvedValueOnce(ok(brief));
    const good = await aiContentBriefJson("s", "u");
    expect(good?.provider).toBe("anthropic");
    expect(good?.value.heading_structure).toEqual(["H1: Fencing in Tallahassee"]);
  });

  it("rejects a health band outside the four allowed", async () => {
    const health = {
      band: "Amber",
      composite_score: 67,
      rank_trend_pts: 15,
      response_pts: 10,
      payment_pts: 20,
      engagement_pts: 5,
      nps_pts: 8,
      goal_pts: 9,
      retention_summary: "ok",
      check_in_email: "Subject: Checking in",
    };
    claudeText.mockResolvedValueOnce(ok(health));
    expect(await aiHealthRiskJson("s", "u")).toBeNull();
    claudeText.mockResolvedValueOnce(ok({ ...health, band: "Yellow" }));
    expect((await aiHealthRiskJson("s", "u"))?.value.band).toBe("Yellow");
  });
});
