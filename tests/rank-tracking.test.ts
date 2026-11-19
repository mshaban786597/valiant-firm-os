import { describe, expect, it, vi } from "vitest";
import {
  buildRankRows,
  filterRanks,
  summarizeRanks,
  trendSegments,
  type RankDayRow,
} from "@/lib/seo/rank-tracking";
import { gscQuery } from "@/lib/integrations/gsc";

const END = new Date("2026-11-14T00:00:00Z");
const day = (n: number) => new Date(END.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const row = (query: string, daysAgo: number, position: number, impressions = 10, clicks = 0): RankDayRow => ({
  query,
  date: day(daysAgo),
  position,
  impressions,
  clicks,
});

describe("rank tracking", () => {
  const rows: RankDayRow[] = [
    // improved: 14 → 8
    row("attic insulation", 9, 14), row("attic insulation", 8, 14), row("attic insulation", 2, 8), row("attic insulation", 0, 8, 10, 1),
    // declined: 3 → 6.5 (weighted by impressions)
    row("polar insulation", 10, 3), row("polar insulation", 1, 5, 10), row("polar insulation", 0, 7, 30),
    // new this week
    row("spray foam cost", 3, 22),
    // seen last week only
    row("old query", 12, 40),
    // flat
    row("steady", 8, 5), row("steady", 1, 5.2),
    // outside the 28-day range: ignored
    row("ancient", 40, 1),
  ];
  const ranks = buildRankRows(rows, END);
  const get = (q: string) => ranks.filter((r) => r.query === q)[0]!;

  it("compares the last 7 days with the 7 days before, weighted by impressions", () => {
    expect(get("attic insulation")).toMatchObject({ current: 8, previous: 14, change: 6, status: "up", best: 8, clicks: 1 });
    // (5x10 + 7x30) / 40 = 6.5
    expect(get("polar insulation")).toMatchObject({ current: 6.5, previous: 3, change: -3.5, status: "down" });
    expect(get("steady").status).toBe("flat");
  });

  it("marks queries as new or not seen instead of inventing a position", () => {
    expect(get("spray foam cost")).toMatchObject({ current: 22, previous: null, change: null, status: "new" });
    expect(get("old query")).toMatchObject({ current: null, previous: 40, status: "lost" });
    expect(ranks.some((r) => r.query === "ancient")).toBe(false);
  });

  it("orders ranking queries best first and puts unseen ones last", () => {
    expect(ranks.map((r) => r.query)).toEqual(["steady", "polar insulation", "attic insulation", "spray foam cost", "old query"]);
  });

  it("builds a 28-day trend with gaps for days not shown", () => {
    const t = get("attic insulation").trend;
    expect(t).toHaveLength(28);
    expect(t[27]).toBe(8); // END
    expect(t[26]).toBeNull(); // no impressions that day
    expect(t.filter((v) => v !== null)).toHaveLength(4);
    expect(get("attic insulation").daysSeen).toBe(4);
  });

  it("summarizes and filters", () => {
    expect(summarizeRanks(ranks)).toEqual({
      tracked: 5, rankingNow: 4, top3: 0, page1: 3, improved: 1, declined: 1, newlySeen: 1, notSeen: 1,
    });
    expect(filterRanks(ranks, "up").map((r) => r.query)).toEqual(["attic insulation"]);
    expect(filterRanks(ranks, "lost").map((r) => r.query)).toEqual(["old query"]);
    expect(filterRanks(ranks, "top10").map((r) => r.query)).toEqual(["steady", "polar insulation", "attic insulation"]);
    expect(filterRanks(ranks, "all")).toHaveLength(5);
  });

  it("handles no data", () => {
    expect(buildRankRows([], END)).toEqual([]);
    expect(summarizeRanks([]).tracked).toBe(0);
  });
});

describe("trend line", () => {
  it("draws position 1 at the top and breaks the line at gaps", () => {
    const segs = trendSegments([10, 5, null, 1, 1], 96, 24);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toBe("0,22 24,10.9"); // 10 is the worst → bottom
    expect(segs[1]!.split(" ")[0]).toBe("72,2"); // position 1 → top
    expect(trendSegments([null, null])).toEqual([]);
    expect(trendSegments([7])).toEqual(["0,2"]);
  });
});

describe("Search Console daily query pull", () => {
  it("asks for date + query and keys rows as date<TAB>query", async () => {
    let body: { dimensions?: string[] } = {};
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ rows: [{ keys: ["2026-11-14", "gutter repair"], clicks: 1, impressions: 12, position: 6.4 }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const r = await gscQuery({ token: "t", siteUrl: "https://a.com/", startDate: "2026-10-18", endDate: "2026-11-14", dimension: "query_date", fetchImpl: f });
    expect(body.dimensions).toEqual(["date", "query"]);
    expect(r.ok && r.data[0]).toEqual({ key: "2026-11-14\tgutter repair", clicks: 1, impressions: 12, position: 6.4 });
  });
});
