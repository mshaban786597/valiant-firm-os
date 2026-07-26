import { describe, expect, it } from "vitest";
import { ruleBasedLeadScore } from "@/lib/ai/rule-score";
import { leadScoreOutputSchema } from "@/lib/schemas/lead-score";
import { LEAD_TRANSITIONS, canTransition } from "@/lib/status";
import { LeadStatus } from "@prisma/client";

const baseLead = {
  business_name: "Acme Plumbing",
  niche: "Plumbing",
  city: "Austin",
  state: "TX",
};

describe("ruleBasedLeadScore", () => {
  it("returns schema-valid output within bounded sub-scores", () => {
    const out = ruleBasedLeadScore(baseLead);
    expect(leadScoreOutputSchema.safeParse(out).success).toBe(true);
    expect(out.composite_score).toBeGreaterThanOrEqual(0);
    expect(out.composite_score).toBeLessThanOrEqual(100);
    expect(out.seo_weakness_score).toBeLessThanOrEqual(25);
    expect(out.gbp_score).toBeLessThanOrEqual(20);
    expect(out.business_signal_score).toBeLessThanOrEqual(15);
  });

  it("is deterministic for identical input", () => {
    const a = ruleBasedLeadScore(baseLead);
    const b = ruleBasedLeadScore(baseLead);
    expect(a).toEqual(b);
  });

  it("penalizes an incomplete GBP relative to an optimized one", () => {
    const incomplete = ruleBasedLeadScore({ ...baseLead, gbp_status: "incomplete" });
    const optimized = ruleBasedLeadScore({ ...baseLead, gbp_status: "optimized" });
    expect(incomplete.gbp_score).toBeLessThan(optimized.gbp_score);
  });

  it("penalizes a slow website relative to a fast one (site held constant)", () => {
    const url = "https://acme.com";
    const slow = ruleBasedLeadScore({ ...baseLead, website_url: url, website_status: "slow" });
    const fast = ruleBasedLeadScore({ ...baseLead, website_url: url, website_status: "fast" });
    expect(slow.website_quality_score).toBeLessThan(fast.website_quality_score);
  });

  it("lowers the SEO sub-score as weakness tags accumulate", () => {
    const clean = ruleBasedLeadScore({ ...baseLead, domain_authority: 25 });
    const flagged = ruleBasedLeadScore({
      ...baseLead,
      domain_authority: 25,
      weakness_tags: ["thin_content", "no_schema"],
    });
    expect(flagged.seo_weakness_score).toBeLessThan(clean.seo_weakness_score);
  });

  it("maps composite score to the correct priority band", () => {
    const priorities = [5, 25, 45].map(
      (da) => ruleBasedLeadScore({ ...baseLead, domain_authority: da }).priority_status,
    );
    priorities.forEach((p) => {
      expect([
        "Priority Target",
        "Outreach Queue",
        "Warm Manual Review",
        "Archive / Recheck Later",
      ]).toContain(p);
    });
  });

  it("derives review_gap and low_authority weakness tags", () => {
    const out = ruleBasedLeadScore({
      ...baseLead,
      domain_authority: 10,
      review_count: 5,
    });
    expect(out.weakness_tags).toContain("low_authority");
    expect(out.weakness_tags).toContain("review_gap");
  });

  it("rejects malformed input via the zod input schema", () => {
    expect(() => ruleBasedLeadScore({ niche: "Plumbing" })).toThrow();
  });
});

describe("lead status transitions", () => {
  it("allows the qualification → outreach path", () => {
    expect(canTransition(LEAD_TRANSITIONS, LeadStatus.Raw, LeadStatus.Qualified)).toBe(true);
    expect(
      canTransition(LEAD_TRANSITIONS, LeadStatus.Qualified, LeadStatus.OutreachQueue),
    ).toBe(true);
  });

  it("forbids skipping straight from Raw to ClosedWon", () => {
    expect(canTransition(LEAD_TRANSITIONS, LeadStatus.Raw, LeadStatus.ClosedWon)).toBe(false);
  });

  it("treats ClosedWon as terminal", () => {
    expect(LEAD_TRANSITIONS[LeadStatus.ClosedWon]).toHaveLength(0);
  });

  it("treats a no-op transition as allowed", () => {
    expect(canTransition(LEAD_TRANSITIONS, LeadStatus.Replied, LeadStatus.Replied)).toBe(true);
  });
});
