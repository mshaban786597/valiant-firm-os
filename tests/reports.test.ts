import { describe, expect, it } from "vitest";
import { ReportStatus } from "@prisma/client";
import { REPORT_TRANSITIONS, canTransition } from "@/lib/status";
import { fallbackReportSummary } from "@/lib/ai/fallbacks";
import { reportSummaryOutputSchema } from "@/lib/schemas/report-summary";

describe("report QA workflow transitions", () => {
  it("moves draft → QA → sent", () => {
    expect(canTransition(REPORT_TRANSITIONS, ReportStatus.Draft, ReportStatus.QA)).toBe(true);
    expect(canTransition(REPORT_TRANSITIONS, ReportStatus.QA, ReportStatus.Sent)).toBe(true);
  });

  it("lets QA bounce back to draft", () => {
    expect(canTransition(REPORT_TRANSITIONS, ReportStatus.QA, ReportStatus.Draft)).toBe(true);
  });

  it("forbids sending straight from draft (must pass QA)", () => {
    expect(canTransition(REPORT_TRANSITIONS, ReportStatus.Draft, ReportStatus.Sent)).toBe(false);
  });

  it("treats Sent as terminal and un-editable", () => {
    expect(REPORT_TRANSITIONS[ReportStatus.Sent]).toHaveLength(0);
    expect(canTransition(REPORT_TRANSITIONS, ReportStatus.Sent, ReportStatus.Draft)).toBe(false);
  });
});

describe("report summary generation (deterministic fallback)", () => {
  it("produces schema-valid output from full metrics", () => {
    const out = fallbackReportSummary({
      client_name: "Acme Plumbing",
      month: "July 2026",
      organic_sessions: 4200,
      organic_leads: 38,
      keyword_growth: 12,
      gbp_calls: 96,
      gbp_views: 5300,
      tasks_completed: 14,
      issues_fixed: 6,
    });
    expect(reportSummaryOutputSchema.safeParse(out).success).toBe(true);
    expect(out.wins_this_month.length).toBeGreaterThan(0);
    expect(out.executive_summary).toContain("Acme Plumbing");
  });

  it("degrades gracefully when metrics are missing", () => {
    const out = fallbackReportSummary({ client_name: "Nova Dental", month: "July 2026" });
    expect(reportSummaryOutputSchema.safeParse(out).success).toBe(true);
    expect(out.next_30_days.length).toBeGreaterThan(0);
  });
});
