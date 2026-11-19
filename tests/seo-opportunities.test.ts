import { describe, expect, it, vi } from "vitest";
import {
  bucketFor,
  buildOpportunities,
  expectedCtr,
  groupByPage,
  keywordGaps,
  opportunityTotals,
  targetPosition,
} from "@/lib/seo/opportunities";
import { gscQuery } from "@/lib/integrations/gsc";

describe("click-through curve and buckets", () => {
  it("falls with position and never invents clicks for deep results", () => {
    expect(expectedCtr(1)).toBe(0.28);
    expect(expectedCtr(3)).toBe(0.11);
    expect(expectedCtr(10)).toBe(0.022);
    expect(expectedCtr(15)).toBe(0.01);
    expect(expectedCtr(60)).toBe(0.002);
    expect(expectedCtr(0)).toBe(0);
  });
  it("buckets positions and picks a realistic next target", () => {
    expect(bucketFor(2)).toBe("defend");
    expect(bucketFor(7)).toBe("quick_win");
    expect(bucketFor(14)).toBe("striking_distance");
    expect(bucketFor(45)).toBe("long_shot");
    expect([2, 7, 14, 45].map(targetPosition)).toEqual([1, 3, 5, 10]);
  });
});

describe("opportunities", () => {
  const rows = [
    { query: "Attic Insulation Tallahassee", page: "https://p.us/attic", clicks: 1, impressions: 280, position: 11.5 },
    { query: "attic insulation tallahassee", page: "https://p.us/", clicks: 0, impressions: 20, position: 30 },
    { query: "polar insulation", page: "https://p.us/", clicks: 2, impressions: 98, position: 2 },
    { query: "spray foam cost", page: "https://p.us/spray-foam", clicks: 0, impressions: 14, position: 8 },
    { query: "no position", page: "https://p.us/x", clicks: 0, impressions: 5, position: null },
  ];

  it("keeps one row per query on its strongest page, with total impressions", () => {
    const opps = buildOpportunities(rows, {}, 28);
    expect(opps.map((o) => o.query.toLowerCase()).sort()).toEqual([
      "attic insulation tallahassee",
      "polar insulation",
      "spray foam cost",
    ]);
    const attic = opps.filter((o) => /attic/i.test(o.query))[0]!;
    expect(attic.page).toBe("https://p.us/attic");
    expect(attic.impressions).toBe(300);
    expect(attic.bucket).toBe("striking_distance");
    expect(attic.target).toBe(5);
    // demand 300 x 30/28 = 321; 321 x 6% = 19.3; minus 1 x 30/28 = 1.07 → 18
    expect(attic.monthlyDemand).toBe(321);
    expect(attic.potentialClicks).toBe(18);
    expect(attic.demandSource).toBe("search_console");
  });

  it("uses keyword-tool volume only when it is higher than observed demand", () => {
    const opps = buildOpportunities(rows, {
      "spray foam cost": { volume: 900, difficulty: 30 },
      "polar insulation": { volume: 10, difficulty: null },
    });
    const foam = opps.filter((o) => o.query === "spray foam cost")[0]!;
    expect(foam).toMatchObject({ monthlyDemand: 900, demandSource: "keyword_tool", difficulty: 30, target: 3, potentialClicks: 99 });
    const brand = opps.filter((o) => o.query === "polar insulation")[0]!;
    expect(brand.demandSource).toBe("search_console"); // tool volume is lower than what GSC saw
    expect(opps[0]!.query).toBe("spray foam cost"); // highest priority first
  });

  it("never reports negative potential", () => {
    const o = buildOpportunities([{ query: "brand", page: "https://p.us/", clicks: 500, impressions: 600, position: 1 }])[0]!;
    expect(o.potentialClicks).toBe(0);
  });

  it("rolls up by page and names the action", () => {
    const pages = groupByPage(buildOpportunities(rows));
    const attic = pages.filter((p) => p.page === "https://p.us/attic")[0]!;
    expect(attic).toMatchObject({ queries: 1, impressions: 300, bucket: "striking_distance" });
    expect(attic.action).toContain("page 2");
    expect(attic.topQueries[0]!.query).toBe("Attic Insulation Tallahassee");
    expect(pages[0]!.priority).toBeGreaterThanOrEqual(pages[pages.length - 1]!.priority);
  });

  it("totals by bucket and handles no data", () => {
    expect(opportunityTotals(buildOpportunities(rows))).toMatchObject({
      queries: 3, quickWins: 1, strikingDistance: 1, defend: 1, longShots: 0,
    });
    expect(buildOpportunities([])).toEqual([]);
    expect(opportunityTotals([])).toMatchObject({ queries: 0, potentialClicks: 0 });
  });

  it("lists tool keywords Search Console did not report", () => {
    const gaps = keywordGaps(
      [
        { keyword: "Polar Insulation", volume: 50 },
        { keyword: "blown in insulation", volume: 400 },
        { keyword: "radiant barrier", volume: 900 },
      ],
      ["polar insulation"],
    );
    expect(gaps.map((g) => g.keyword)).toEqual(["radiant barrier", "blown in insulation"]);
  });
});

describe("Search Console query + page pull", () => {
  it("asks for both dimensions and keys rows as query<TAB>page", async () => {
    let body: { dimensions?: string[] } = {};
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ rows: [{ keys: ["gutter repair", "https://a.com/repair/"], clicks: 3, impressions: 40, position: 6.2 }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const r = await gscQuery({ token: "t", siteUrl: "https://a.com/", startDate: "2026-10-18", endDate: "2026-11-14", dimension: "query_page", fetchImpl: f });
    expect(body.dimensions).toEqual(["query", "page"]);
    expect(r.ok && r.data[0]).toEqual({ key: "gutter repair\thttps://a.com/repair/", clicks: 3, impressions: 40, position: 6.2 });
  });
});
