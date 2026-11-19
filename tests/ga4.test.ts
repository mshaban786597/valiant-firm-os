import { describe, expect, it } from "vitest";
import {
  changePct,
  classifyGa4Status,
  defaultGa4Periods,
  engagementRate,
  ga4Date,
  ga4ListProperties,
  ga4RunReport,
  parseAccountSummaries,
  parseReport,
  toTotals,
} from "@/lib/integrations/ga4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("GA4 adapter", () => {
  it("uses the last 28 complete days and the 28 days before them", () => {
    const p = defaultGa4Periods(new Date("2026-11-17T15:00:00Z"));
    expect(p.current).toEqual({ startDate: "2026-10-20", endDate: "2026-11-16" });
    expect(p.previous).toEqual({ startDate: "2026-09-22", endDate: "2026-10-19" });
  });

  it("flattens account summaries into properties and skips malformed ids", () => {
    const rows = parseAccountSummaries({
      accountSummaries: [
        {
          account: "accounts/404016501",
          displayName: "Big Bend Gutters",
          propertySummaries: [
            { property: "properties/549121222", displayName: "Big Bend Gutters" },
            { property: "properties/abc", displayName: "bad" },
          ],
        },
        { account: "accounts/1", displayName: "Empty" },
      ],
    });
    expect(rows).toEqual([
      { propertyId: "549121222", displayName: "Big Bend Gutters", accountId: "404016501", accountName: "Big Bend Gutters" },
    ]);
    expect(parseAccountSummaries(null)).toEqual([]);
  });

  it("reads report rows as numbers and returns nothing for an empty report", () => {
    const rows = parseReport({
      rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "31" }, { value: "24" }, { value: "x" }] }],
    });
    expect(rows).toEqual([{ dims: ["Organic Search"], values: [31, 24, 0] }]);
    expect(parseReport({})).toEqual([]);
  });

  it("maps metric order to named totals and computes engagement from sessions", () => {
    const t = toTotals([54, 39, 30, 2, 27, 120, 1830.5]);
    expect(t).toEqual({ sessions: 54, users: 39, newUsers: 30, keyEvents: 2, engagedSessions: 27, views: 120, engagementSeconds: 1830.5 });
    expect(engagementRate(t)).toBe(0.5);
    expect(engagementRate({ engagedSessions: 0, sessions: 0 })).toBeNull();
  });

  it("formats dates, change and provider status", () => {
    expect(ga4Date("20261103")).toBe("2026-11-03");
    expect(ga4Date("(other)")).toBe("(other)");
    expect(changePct(120, 100)).toBe(20);
    expect(changePct(50, 0)).toBeNull();
    expect(changePct(50, null)).toBeNull();
    expect(classifyGa4Status(403)).toBe("forbidden");
    expect(classifyGa4Status(429)).toBe("quota");
    expect(classifyGa4Status(401)).toBe("needs_reauth");
    expect(classifyGa4Status(500)).toBe("error");
  });

  it("sends a read-only report request and surfaces a permission error without inventing data", async () => {
    let seen: { url: string; body: string; auth: string | null } | null = null;
    const ok: typeof fetch = async (url, init) => {
      seen = { url: String(url), body: String(init?.body), auth: new Headers(init?.headers).get("authorization") };
      return json({ rows: [{ dimensionValues: [{ value: "20261101" }], metricValues: [{ value: "3" }] }] });
    };
    const r = await ga4RunReport("tok", "549121222", { startDate: "2026-10-20", endDate: "2026-11-16", dimension: "date" }, ok);
    expect(r.ok && r.data[0]!.values[0]).toBe(3);
    expect(seen!.url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/549121222:runReport");
    expect(seen!.auth).toBe("Bearer tok");
    expect(JSON.parse(seen!.body).dimensions).toEqual([{ name: "date" }]);

    const denied: typeof fetch = async () => json({ error: { message: "User does not have sufficient permissions" } }, 403);
    const d = await ga4RunReport("tok", "1", { startDate: "2026-10-20", endDate: "2026-11-16" }, denied);
    expect(d).toMatchObject({ ok: false, state: "forbidden" });
    expect(!d.ok && d.detail).toContain("sufficient permissions");

    const down: typeof fetch = async () => {
      throw new Error("network");
    };
    expect(await ga4ListProperties("tok", down)).toMatchObject({ ok: false, state: "error" });
  });
});
