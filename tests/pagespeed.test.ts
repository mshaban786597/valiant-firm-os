import { describe, expect, it } from "vitest";
import { buildPageSpeedReport, pageSpeedDetail, speedVerdict } from "@/lib/monitoring/pagespeed";

/** Shape taken from a real Lighthouse 13 response (watertreatmentco.com). */
function psi(over: { score: number; lcp: number; cls?: number; audits?: Record<string, unknown> }) {
  return {
    lighthouseResult: {
      categories: { performance: { score: over.score } },
      audits: {
        "first-contentful-paint": { numericValue: 3600, score: 0.31, scoreDisplayMode: "numeric" },
        "largest-contentful-paint": { numericValue: over.lcp, score: 0, scoreDisplayMode: "numeric" },
        "total-blocking-time": { numericValue: 250, score: 0.85, scoreDisplayMode: "numeric" },
        "cumulative-layout-shift": { numericValue: over.cls ?? 0, score: 1, scoreDisplayMode: "numeric" },
        "speed-index": { numericValue: 5800, score: 0.5, scoreDisplayMode: "numeric" },
        ...(over.audits ?? {}),
      },
    },
  };
}

const SLOW_AUDITS = {
  "lcp-breakdown-insight": {
    score: 0,
    scoreDisplayMode: "numeric",
    details: {
      type: "list",
      items: [
        {
          type: "table",
          items: [
            { subpart: "timeToFirstByte", label: "Time to first byte", duration: 16 },
            { subpart: "resourceLoadDelay", label: "Resource load delay", duration: 102 },
            { subpart: "resourceLoadDuration", label: "Resource load duration", duration: 92 },
            { subpart: "elementRenderDelay", label: "Element render delay", duration: 2153 },
          ],
        },
        { type: "node", snippet: '<video class="hero-bg" autoplay muted loop>', selector: "body > main#main > section.hero > video.hero-bg" },
      ],
    },
  },
  "unused-javascript": {
    title: "Reduce unused JavaScript", score: 0, scoreDisplayMode: "metricSavings",
    displayValue: "Est savings of 147 KiB", metricSavings: { LCP: 750, FCP: 300 }, details: { type: "opportunity", overallSavingsMs: 750 },
  },
  "cache-insight": {
    title: "Use efficient cache lifetimes", score: 0, scoreDisplayMode: "metricSavings",
    displayValue: "Est savings of 1,220 KiB", metricSavings: { LCP: 150, FCP: 0 },
  },
  "total-byte-weight": {
    title: "Avoid enormous network payloads", score: 0.5, scoreDisplayMode: "metricSavings", displayValue: "Total size was 3,699 KiB",
  },
  "lcp-discovery-insight": {
    title: "LCP request discovery", score: 0, scoreDisplayMode: "numeric", metricSavings: { LCP: 0 },
    details: {
      type: "list",
      items: [
        {
          type: "checklist",
          items: {
            eagerlyLoaded: { label: "LCP resources shouldn't use loading=lazy", value: true },
            priorityHinted: { label: "fetchpriority=high should be applied", value: false },
          },
        },
      ],
    },
  },
  // Must never be listed as causes:
  "server-response-time": { title: "Initial server response time was short", score: 1, scoreDisplayMode: "metricSavings", displayValue: "Root document took 10 ms" },
  "layout-shifts": { title: "Avoid large layout shifts", score: null, scoreDisplayMode: "notApplicable" },
  interactive: { title: "Time to Interactive", score: 0.07, scoreDisplayMode: "numeric" },
};

describe("page speed verdict", () => {
  it("uses Google's Core Web Vitals bands", () => {
    expect(speedVerdict(95, 2000, 0.02)).toBe("good");
    expect(speedVerdict(87, 3000, 0.02)).toBe("needs_improvement");
    expect(speedVerdict(95, 2000, 0.2)).toBe("needs_improvement");
    expect(speedVerdict(58, 15200, 0)).toBe("poor"); // LCP over 4s
    expect(speedVerdict(40, 2000, 0)).toBe("poor"); // score under 50
    expect(speedVerdict(95, 2000, 0.3)).toBe("poor"); // layout shift over 0.25
  });
});

describe("page speed report", () => {
  const report = buildPageSpeedReport(psi({ score: 0.58, lcp: 15200, audits: SLOW_AUDITS }));

  it("reads the numbers from Google's report", () => {
    expect(report).toMatchObject({ score: 58, lcpMs: 15200, fcpMs: 3600, tbtMs: 250, cls: 0, speedIndexMs: 5800, verdict: "poor" });
  });

  it("names the largest element and the biggest part of its load time", () => {
    expect(report.largestElement).toBe("background video (video.hero-bg)");
    expect(report.lcpBreakdown.map((p) => p.share)).toEqual([1, 4, 4, 91]);
    expect(report.mainCause).toBe(
      "The largest element, the background video (video.hero-bg), is ready early but shown late: 91% of its load time is render delay. It is waiting on JavaScript, a video or an animation before it appears.",
    );
  });

  it("lists Google's fixes, largest estimated saving first, and skips passing or non-cause audits", () => {
    expect(report.reasons.map((r) => r.id)).toEqual(["unused-javascript", "cache-insight", "total-byte-weight", "lcp-discovery-insight"]);
    expect(report.reasons[0]).toMatchObject({ title: "Reduce unused JavaScript", detail: "Est savings of 147 KiB", savingsMs: 750 });
    // Checklist audits name the failing item.
    expect(report.reasons[3]!.detail).toBe("fetchpriority=high should be applied");
  });

  it("puts the cause in the one-line result", () => {
    const line = pageSpeedDetail(report);
    expect(line.startsWith("Performance 58/100 · LCP 15.2s · CLS 0. Slow: The largest element, the background video")).toBe(true);
    expect(line).toContain("Reduce unused JavaScript (Est savings of 147 KiB)");
  });

  it("blames the server when time to first byte dominates", () => {
    const r = buildPageSpeedReport(
      psi({
        score: 0.45,
        lcp: 6000,
        audits: {
          "lcp-breakdown-insight": {
            details: {
              items: [
                {
                  type: "table",
                  items: [
                    { subpart: "timeToFirstByte", label: "Time to first byte", duration: 3000 },
                    { subpart: "elementRenderDelay", label: "Element render delay", duration: 500 },
                  ],
                },
              ],
            },
          },
        },
      }),
    );
    expect(r.mainCause).toBe("The server is slow to send the page: 86% of the load time is spent waiting for the first byte.");
  });

  it("gives no cause for a fast page and handles an empty response", () => {
    const fast = buildPageSpeedReport(psi({ score: 0.99, lcp: 1700, audits: SLOW_AUDITS }));
    expect(fast.verdict).toBe("good");
    expect(fast.mainCause).toBeNull();
    expect(pageSpeedDetail(fast)).toBe("Performance 99/100 · LCP 1.7s · CLS 0");

    const empty = buildPageSpeedReport({});
    expect(empty).toMatchObject({ score: null, lcpMs: null, reasons: [], mainCause: null });
    expect(pageSpeedDetail(empty)).toBe("PageSpeed returned no performance score");
  });
});
