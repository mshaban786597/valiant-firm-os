import { describe, expect, it } from "vitest";
import {
  checkState,
  computeUptime,
  describeOutcome,
  noIncidentsCopy,
  passRateLabel,
  summarizeChecks,
  uptimeLabel,
  type CheckLike,
} from "@/lib/monitoring/state";
import { computeDashboardKpis, settle } from "@/lib/dashboard/kpis";
import { scopeFromValue } from "@/lib/scope";

const now = new Date("2026-11-17T12:00:00Z");
const mins = (n: number) => new Date(now.getTime() - n * 60_000);
const check = (over: Partial<CheckLike>): CheckLike => ({
  enabled: true,
  type: "UPTIME",
  lastStatus: "ok",
  lastCheckAt: mins(5),
  cadenceMinutes: 15,
  ...over,
});

describe("check state (shared definition)", () => {
  it("distinguishes passing, failing, unmeasured, stale, never run and disabled", () => {
    expect(checkState(check({}), now)).toBe("passing");
    expect(checkState(check({ lastStatus: "fail" }), now)).toBe("failing");
    expect(checkState(check({ lastStatus: "unknown" }), now)).toBe("unmeasured");
    expect(checkState(check({ lastCheckAt: mins(61) }), now)).toBe("stale"); // 15-min cadence → 60-min floor
    expect(checkState(check({ lastStatus: null, lastCheckAt: null }), now)).toBe("never_run");
    expect(checkState(check({ enabled: false }), now)).toBe("disabled");
  });
  it("keeps an old failure failing (it is still an open problem), and scales freshness with cadence", () => {
    expect(checkState(check({ lastStatus: "fail", lastCheckAt: mins(5000) }), now)).toBe("failing");
    expect(checkState(check({ cadenceMinutes: 1440, lastCheckAt: mins(2000) }), now)).toBe("passing");
    expect(checkState(check({ cadenceMinutes: 1440, lastCheckAt: mins(4400) }), now)).toBe("stale");
  });
  it("never marks event-driven checks stale by age", () => {
    expect(checkState(check({ type: "LEAD_ROUTE", lastCheckAt: mins(100000) }), now)).toBe("passing");
  });
});

describe("pass rate and empty-state copy", () => {
  // The walkthrough's data: 9 passing + 1 unmeasured page-speed check.
  const walkthrough = [
    ...Array.from({ length: 9 }, () => check({})),
    check({ type: "PAGE_SPEED", lastStatus: "unknown", cadenceMinutes: 1440 }),
  ];
  it("reproduces the mismatch correctly: 100% of measured checks, 1 not measured (not 90% uptime)", () => {
    const s = summarizeChecks(walkthrough, now);
    expect(s).toMatchObject({ eligible: 10, passing: 9, failing: 0, unmeasured: 1, measured: 9, passRatePct: 100 });
    expect(passRateLabel(s)).toBe("9 of 9 measured checks passed · 1 not measured");
    expect(noIncidentsCopy(s).description).toBe(
      "9 of 10 eligible checks are passing and fresh; 1 could not be measured.",
    );
  });
  it("only claims everything is healthy when it is", () => {
    const s = summarizeChecks([check({}), check({})], now);
    expect(noIncidentsCopy(s).description).toBe("All 2 eligible checks passed at their latest run.");
  });
  it("excludes disabled checks from the rate and reports no data honestly", () => {
    const s = summarizeChecks([check({ enabled: false }), check({ lastStatus: "fail" }), check({})], now);
    expect(s).toMatchObject({ eligible: 2, disabled: 1, measured: 2, passRatePct: 50 });
    const empty = summarizeChecks([], now);
    expect(empty.passRatePct).toBeNull();
    expect(noIncidentsCopy(empty).title).toBe("No checks yet");
    expect(passRateLabel(summarizeChecks([check({ lastStatus: null, lastCheckAt: null })], now))).toBe(
      "No checks measured yet · 1 never run",
    );
  });
});

describe("uptime", () => {
  const obs = (status: string, minutesAgo: number) => ({ status, observedAt: mins(minutesAgo) });
  it("is unavailable with too few observations in the window", () => {
    const u = computeUptime([obs("ok", 10), obs("ok", 20)], 24, now);
    expect(u.pct).toBeNull();
    expect(uptimeLabel(u)).toEqual({
      value: "Unavailable",
      hint: "2 uptime observations in the last 24h; 4 needed",
    });
  });
  it("is computed from real observations in the named window, ignoring unmeasured and out-of-window ones", () => {
    const u = computeUptime(
      [obs("ok", 10), obs("ok", 30), obs("fail", 60), obs("ok", 90), obs("unknown", 100), obs("fail", 60 * 30)],
      24,
      now,
    );
    expect(u).toMatchObject({ ok: 3, fail: 1, pct: 75 });
    expect(uptimeLabel(u).hint).toBe("3 of 4 uptime observations passed in the last 24h");
  });
});

describe("outcome feedback", () => {
  const at = new Date("2026-11-17T14:03:00Z");
  it("never says 'none': it states the outcome, the time and the next action", () => {
    const pass = describeOutcome({ status: "ok", detail: "HTTP 200 in 300ms", action: "none", observedAt: at });
    expect(pass).toBe("Passed at 14:03 UTC. HTTP 200 in 300ms. No action needed.");
    expect(describeOutcome({ status: "unknown", detail: "PageSpeed API unavailable (HTTP 429)", action: "none", observedAt: at })).toContain(
      "Could not be measured at 14:03 UTC.",
    );
    expect(describeOutcome({ status: "fail", action: "incident_opened", observedAt: at })).toContain("An incident was opened");
    expect(describeOutcome({ status: "fail", action: "incident_occurrence", observedAt: at })).toContain("no duplicate");
    expect(describeOutcome({ status: "fail", action: "incident_retry", observedAt: at })).toContain("retry");
    expect(
      describeOutcome({ status: "fail", action: "failure_unconfirmed", observedAt: at, consecutiveFailures: 1, confirmAfter: 2 }),
    ).toContain("Failure 1 of 2 needed to confirm");
    expect(describeOutcome({ status: "ok", action: "incident_resolved", observedAt: at })).toContain("resolved");
  });
});

describe("dashboard KPIs", () => {
  it("returns zeros for an empty tenant (no crash, no invented numbers)", () => {
    const k = computeDashboardKpis({ clients: [], leads: [], deals: [], invoices: [], now });
    expect(Object.values(k).every((v) => v === 0)).toBe(true);
  });
  it("reports contracted, invoiced and collected as separate sourced metrics", () => {
    const k = computeDashboardKpis({
      now,
      clients: [
        { status: "Active", monthlyValue: 2000, createdAt: mins(60 * 24 * 90) },
        { status: "Onboarding", monthlyValue: 1500, createdAt: mins(60 * 24 * 2) },
        { status: "Churned", monthlyValue: 900, createdAt: mins(60 * 24 * 200) },
        { status: "Paused", monthlyValue: 700, createdAt: mins(60 * 24 * 200) },
      ],
      leads: [
        { status: "Qualified", leadScore: 40, sequenceStartedAt: null, manualReplied: false, manualBooked: false },
        { status: "Raw", leadScore: 70, sequenceStartedAt: mins(10), manualReplied: true, manualBooked: true },
        { status: "Raw", leadScore: 10, sequenceStartedAt: null, manualReplied: false, manualBooked: false },
      ],
      deals: [{ stage: "ClosedWon" }, { stage: "ProposalSent" }],
      invoices: [
        { status: "Paid", totalCents: 200000, issuedAt: mins(60 * 24 * 5), paidAt: mins(60 * 24 * 1) },
        { status: "Open", totalCents: 150000, issuedAt: mins(60 * 24 * 3), paidAt: null },
        { status: "Draft", totalCents: 999900, issuedAt: mins(60), paidAt: null },
        { status: "Paid", totalCents: 50000, issuedAt: mins(60 * 24 * 60), paidAt: mins(60 * 24 * 45) },
      ],
    });
    expect(k.contractedMrr).toBe(3500);
    expect(k.newMrr30d).toBe(1500);
    expect(k.churnedMrr).toBe(900);
    expect(k.invoiced30d).toBe(3500); // paid + open issued in window; draft excluded
    expect(k.collected30d).toBe(2000); // only the payment inside the window
    expect(k).toMatchObject({
      activeClients: 1, onboardingClients: 1, qualifiedLeads: 2, outreachSent: 1,
      positiveReplies: 1, callsBooked: 1, proposalsSent: 1, closedWonDeals: 1,
    });
  });
  it("degrades a failing secondary source to null instead of throwing", async () => {
    expect(await settle(Promise.reject(new Error("provider down")))).toBeNull();
    expect(await settle(Promise.resolve(3))).toBe(3);
  });
});

describe("data scope", () => {
  it("defaults to live and only switches on an explicit demo value", () => {
    expect(scopeFromValue(undefined)).toMatchObject({ env: "live", isDemo: false });
    expect(scopeFromValue("anything")).toMatchObject({ env: "live", isDemo: false });
    expect(scopeFromValue("demo")).toMatchObject({ env: "demo", isDemo: true, label: "Demo data" });
  });
});
