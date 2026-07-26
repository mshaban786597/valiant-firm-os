import { describe, expect, it } from "vitest";
import {
  sampleAdsMetrics,
  sampleEmailEngagement,
  sampleGbpInsights,
  sampleGscInsights,
  seedHash,
} from "@/lib/integrations/sample";

describe("seedHash", () => {
  it("is deterministic and non-negative", () => {
    expect(seedHash("abc")).toBe(seedHash("abc"));
    expect(seedHash("abc")).toBeGreaterThanOrEqual(0);
    expect(seedHash("abc")).not.toBe(seedHash("abd"));
  });
});

describe("sampleGbpInsights", () => {
  it("is deterministic and within realistic bounds", () => {
    const a = sampleGbpInsights("place-123");
    const b = sampleGbpInsights("place-123");
    expect(a).toEqual(b);
    expect(a.rating).toBeGreaterThanOrEqual(3.9);
    expect(a.rating).toBeLessThanOrEqual(4.9);
    expect(a.reviewCount).toBeGreaterThanOrEqual(12);
    expect(a.postsLast30Days).toBeLessThanOrEqual(16);
  });
});

describe("sampleGscInsights", () => {
  it("returns 8 templated keywords with computed CTR and clicks ≤ impressions", () => {
    const insights = sampleGscInsights("https://acme.com", "plumbing", "Austin");
    expect(insights.keywords).toHaveLength(8);
    for (const k of insights.keywords) {
      expect(k.clicks).toBeLessThanOrEqual(k.impressions);
      expect(k.position).toBeGreaterThanOrEqual(1);
    }
    expect(insights.clicks28d).toBeLessThanOrEqual(insights.impressions28d);
  });

  it("substitutes niche and city into templates", () => {
    const insights = sampleGscInsights("s", "plumbing", "Austin");
    const joined = insights.keywords.map((k) => k.query).join(" | ");
    expect(joined).toContain("plumbing");
    expect(joined).toContain("Austin");
  });
});

describe("sampleAdsMetrics", () => {
  it("keeps conversions ≤ clicks ≤ impressions and derives CPA", () => {
    const m = sampleAdsMetrics("cmp-9");
    expect(m.clicks).toBeLessThanOrEqual(m.impressions);
    expect(m.conversions).toBeLessThanOrEqual(m.clicks);
    if (m.conversions > 0) {
      expect(m.costPerConv).toBe(Math.round(m.spend / m.conversions));
    }
  });
});

describe("sampleEmailEngagement", () => {
  it("returns zeros for an empty list", () => {
    expect(sampleEmailEngagement("c1", 0)).toEqual({ opens: 0, clicks: 0, unsubscribes: 0 });
  });

  it("keeps opens ≤ recipients and clicks ≤ opens", () => {
    const e = sampleEmailEngagement("c1", 500);
    expect(e.opens).toBeLessThanOrEqual(500);
    expect(e.clicks).toBeLessThanOrEqual(e.opens);
  });
});
