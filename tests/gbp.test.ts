import { describe, expect, it } from "vitest";
import {
  classifyGbpError,
  dailyMetricsUrl,
  defaultGbpPeriod,
  formatAddress,
  gbpAcceptInvitation,
  gbpDailyMetrics,
  gbpListAccounts,
  gbpListInvitations,
  gbpListLocations,
  parseAccounts,
  parseDailyMetrics,
  parseLocation,
  parseReviewSummary,
  sumDays,
} from "@/lib/integrations/gbp";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("GBP adapter", () => {
  it("tells an unapproved project apart from a real rate limit and a disabled API", () => {
    const unapproved = JSON.stringify({
      error: { code: 429, message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'", details: [{ metadata: { quota_limit_value: "0" } }] },
    });
    expect(classifyGbpError(429, unapproved)).toBe("not_approved");
    expect(classifyGbpError(429, JSON.stringify({ error: { details: [{ metadata: { quota_limit_value: "300" } }] } }))).toBe("quota");
    expect(classifyGbpError(403, "My Business Account Management API has not been used in project 1 before or it is disabled.")).toBe("api_disabled");
    expect(classifyGbpError(403, "The caller does not have permission")).toBe("forbidden");
    expect(classifyGbpError(401, "")).toBe("needs_reauth");
    expect(classifyGbpError(500, "")).toBe("error");
  });

  it("uses 28 days ending three days ago", () => {
    const p = defaultGbpPeriod(new Date("2026-11-19T09:00:00Z"));
    expect(p.startDate).toBe("2026-10-20");
    expect(p.endDate).toBe("2026-11-16");
  });

  it("reads accounts and ignores malformed names", () => {
    expect(parseAccounts({ accounts: [{ name: "accounts/123", accountName: "Valiant", type: "PERSONAL" }, { name: "bad" }] })).toEqual([
      { name: "accounts/123", accountName: "Valiant", type: "PERSONAL" },
    ]);
    expect(parseAccounts(null)).toEqual([]);
  });

  it("reads a location and lists only the profile fields that are really empty", () => {
    const full = parseLocation({
      name: "locations/987",
      title: "Big Bend Gutters",
      websiteUri: "https://bigbendgutters.com/",
      phoneNumbers: { primaryPhone: "(850) 819-6031" },
      categories: { primaryCategory: { displayName: "Gutter service" } },
      storefrontAddress: { addressLines: ["1 Main St"], locality: "Wewahitchka", administrativeArea: "FL", postalCode: "32465" },
      regularHours: { periods: [{}] },
      profile: { description: "Seamless gutters." },
      metadata: { mapsUri: "https://maps.google.com/?cid=1", placeId: "ChIJ" },
    });
    expect(full).toMatchObject({ locationId: "locations/987", title: "Big Bend Gutters", category: "Gutter service", address: "1 Main St, Wewahitchka, FL 32465", missing: [] });

    const thin = parseLocation({ name: "locations/5", title: "Thin Co", serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY" } });
    expect(thin!.missing).toEqual(["Website", "Phone number", "Primary category", "Opening hours", "Business description"]);
    expect(parseLocation({ name: "locations/6", title: "No address" })!.missing).toContain("Address or service area");
    expect(parseLocation({ title: "no id" })).toBeNull();
    expect(formatAddress(undefined)).toBeNull();
  });

  it("folds Google's per-metric series into one row per day and sums them", () => {
    const v = (day: number, value?: string) => ({ date: { year: 2026, month: 11, day }, ...(value ? { value } : {}) });
    const days = parseDailyMetrics({
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", timeSeries: { datedValues: [v(1, "10"), v(2, "4")] } },
            { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", timeSeries: { datedValues: [v(1, "30"), v(2)] } },
            { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [v(1, "7")] } },
            { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [v(2, "3")] } },
            { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [v(1, "2")] } },
            { dailyMetric: "SOMETHING_NEW", timeSeries: { datedValues: [v(1, "99")] } },
          ],
        },
      ],
    });
    expect(days).toEqual([
      { date: "2026-11-01", searchViews: 40, mapsViews: 7, calls: 0, websiteClicks: 2, directions: 0 },
      { date: "2026-11-02", searchViews: 4, mapsViews: 0, calls: 3, websiteClicks: 0, directions: 0 },
    ]);
    expect(sumDays(days)).toEqual({ searchViews: 44, mapsViews: 7, calls: 3, websiteClicks: 2, directions: 0 });
    expect(parseDailyMetrics({})).toEqual([]);
  });

  it("builds the performance request Google documents", () => {
    const url = dailyMetricsUrl("locations/987", new Date("2026-10-20T00:00:00Z"), new Date("2026-11-16T00:00:00Z"));
    expect(url.startsWith("https://businessprofileperformance.googleapis.com/v1/locations/987:fetchMultiDailyMetricsTimeSeries?")).toBe(true);
    expect(url).toContain("dailyMetrics=CALL_CLICKS");
    expect(url).toContain("dailyRange.start_date.year=2026&dailyRange.start_date.month=10&dailyRange.start_date.day=20");
    expect(url).toContain("dailyRange.end_date.year=2026&dailyRange.end_date.month=11&dailyRange.end_date.day=16");
  });

  it("reads a review summary and never turns 'no rating' into zero stars", () => {
    expect(parseReviewSummary({ averageRating: 4.666, totalReviewCount: 31 })).toEqual({ rating: 4.67, reviewCount: 31 });
    expect(parseReviewSummary({})).toEqual({ rating: null, reviewCount: 0 });
  });

  it("calls Google with the bearer token, pages through locations, and reports a block without inventing data", async () => {
    const seen: { url: string; method: string; auth: string | null }[] = [];
    const ok: typeof fetch = async (url, init) => {
      const u = String(url);
      seen.push({ url: u, method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization") });
      if (u.endsWith("/accounts?pageSize=20")) return json({ accounts: [{ name: "accounts/1", accountName: "A" }] });
      if (u.endsWith("/accounts/1/invitations")) return json({ invitations: [{ name: "accounts/1/invitations/9" }, { name: "junk" }] });
      if (u.endsWith(":accept")) return json({});
      if (u.indexOf("pageToken=next") !== -1) return json({ locations: [{ name: "locations/2", title: "Two" }] });
      if (u.indexOf("/accounts/1/locations") !== -1) return json({ locations: [{ name: "locations/1", title: "One" }], nextPageToken: "next" });
      return json({ multiDailyMetricTimeSeries: [] });
    };
    const accounts = await gbpListAccounts("tok", ok);
    expect(accounts.ok && accounts.data[0]!.name).toBe("accounts/1");
    const inv = await gbpListInvitations("tok", "accounts/1", ok);
    expect(inv.ok && inv.data).toEqual(["accounts/1/invitations/9"]);
    expect((await gbpAcceptInvitation("tok", "accounts/1/invitations/9", ok)).ok).toBe(true);
    const locs = await gbpListLocations("tok", "accounts/1", ok);
    expect(locs.ok && locs.data.map((l) => l.locationId)).toEqual(["locations/1", "locations/2"]);
    expect(seen.every((s) => s.auth === "Bearer tok")).toBe(true);
    expect(seen.filter((s) => s.method === "POST").map((s) => s.url)).toEqual(["https://mybusinessaccountmanagement.googleapis.com/v1/accounts/1/invitations/9:accept"]);

    const blocked: typeof fetch = async () =>
      json({ error: { code: 429, message: "Quota exceeded", details: [{ metadata: { quota_limit_value: "0" } }] } }, 429);
    const d = await gbpDailyMetrics("tok", "locations/1", new Date("2026-10-20T00:00:00Z"), new Date("2026-11-16T00:00:00Z"), blocked);
    expect(d).toMatchObject({ ok: false, state: "not_approved" });
    const down: typeof fetch = async () => {
      throw new Error("network");
    };
    expect(await gbpListAccounts("tok", down)).toMatchObject({ ok: false, state: "error" });
  });
});
