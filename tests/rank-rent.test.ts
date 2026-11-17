import { describe, expect, it } from "vitest";
import { siteDomain } from "@/lib/clients/link-site";
import { mainAnalytics, pagesFromCrawlState } from "@/lib/rank-rent/live";
import { rankRentCreateSchema, rankRentUpdateSchema } from "@/lib/schemas/rank-rent";

describe("site linking", () => {
  it("reduces any form of a site address to its domain", () => {
    expect(siteDomain("https://www.NewVisionGutters.com/services")).toBe("newvisiongutters.com");
    expect(siteDomain("sc-domain:jemwindows.com")).toBe("jemwindows.com");
    expect(siteDomain("watertreatmentco.com")).toBe("watertreatmentco.com");
    expect(siteDomain(null)).toBeNull();
  });

  it("does not treat a longer domain as the same site", () => {
    expect(siteDomain("https://bigbendgutters.com")).not.toBe(siteDomain("https://notbigbendgutters.com"));
    expect(siteDomain("https://shop.bigbendgutters.com")).toBe("shop.bigbendgutters.com");
  });
});

describe("rank-and-rent live numbers", () => {
  it("uses the largest Analytics property instead of adding two tags together", () => {
    expect(mainAnalytics([{ sessions28d: 42, keyEvents28d: 0 }, { sessions28d: 135, keyEvents28d: 11 }])).toEqual({
      sessions: 135,
      keyEvents: 11,
      properties: 2,
    });
    expect(mainAnalytics([])).toBeNull();
  });

  it("reads the page count from a crawl and returns null when there is none", () => {
    expect(pagesFromCrawlState({ findings: { pagesInSitemap: 99 } })).toBe(99);
    expect(pagesFromCrawlState(null)).toBeNull();
    expect(pagesFromCrawlState({ findings: {} })).toBeNull();
  });

  it("cleans the domain and rejects something that is not one", () => {
    const ok = rankRentCreateSchema.safeParse({ domain: "https://www.JEMWindows.com/contact", niche: "Windows", city: "Tallahassee", state: "FL" });
    expect(ok.success && ok.data.domain).toBe("jemwindows.com");
    expect(rankRentCreateSchema.safeParse({ domain: "not a domain", niche: "Windows", city: "Tallahassee", state: "FL" }).success).toBe(false);
  });

  it("lets rent be cleared and refuses a negative rent or unknown stage", () => {
    expect(rankRentUpdateSchema.safeParse({ monthlyRevenue: null, renterStatus: "" }).success).toBe(true);
    expect(rankRentUpdateSchema.safeParse({ monthlyRevenue: -5 }).success).toBe(false);
    expect(rankRentUpdateSchema.safeParse({ status: "Profitable" }).success).toBe(false);
  });
});
