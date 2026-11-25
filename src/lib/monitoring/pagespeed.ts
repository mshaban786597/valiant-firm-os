/**
 * Turn a PageSpeed Insights (Lighthouse) response into a plain report:
 * the numbers, a verdict, and WHY the page is slow.
 *
 * Everything here is read from Google's own report. Verdict thresholds are
 * Google's Core Web Vitals bands (LCP good ≤ 2.5s, poor > 4s; CLS good ≤ 0.1,
 * poor > 0.25). This is a lab test on a simulated mid-range phone and slow 4G,
 * so it is stricter than what most real visitors see.
 */
export type SpeedVerdict = "good" | "needs_improvement" | "poor";

export interface SpeedReason {
  id: string;
  title: string;
  detail: string;
  /** Google's estimated saving for LCP/FCP in ms, when it gives one. */
  savingsMs: number;
}

export interface PageSpeedReport {
  score: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  tbtMs: number | null;
  cls: number | null;
  speedIndexMs: number | null;
  verdict: SpeedVerdict;
  /** One sentence naming the biggest cause, when the page is not fast. */
  mainCause: string | null;
  /** What the largest element is, e.g. "background video (video.hero-bg)". */
  largestElement: string | null;
  lcpBreakdown: { label: string; ms: number; share: number }[];
  reasons: SpeedReason[];
}

interface Audit {
  id?: string;
  title?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  metricSavings?: Record<string, number>;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    items?: unknown[];
  };
}

/** Audits that are metrics or pure diagnostics trees, not causes. */
const NOT_A_REASON: Record<string, true> = {
  "first-contentful-paint": true,
  "largest-contentful-paint": true,
  "total-blocking-time": true,
  "cumulative-layout-shift": true,
  "speed-index": true,
  interactive: true,
  "max-potential-fid": true,
  "lcp-breakdown-insight": true,
  "largest-contentful-paint-element": true,
  "network-dependency-tree-insight": true,
  "layout-shifts": true,
  "non-composited-animations": true,
};

const num = (a: Audit | undefined) => (a && typeof a.numericValue === "number" ? a.numericValue : null);

export function speedVerdict(score: number | null, lcpMs: number | null, cls: number | null): SpeedVerdict {
  const poor = (score !== null && score < 50) || (lcpMs !== null && lcpMs > 4000) || (cls !== null && cls > 0.25);
  if (poor) return "poor";
  const good = (score === null || score >= 90) && (lcpMs === null || lcpMs <= 2500) && (cls === null || cls <= 0.1);
  return good ? "good" : "needs_improvement";
}

function describeElement(node: { snippet?: string; selector?: string } | null): string | null {
  if (!node) return null;
  const tag = /^<\s*([a-z0-9-]+)/i.exec(node.snippet ?? "")?.[1]?.toLowerCase() ?? "";
  const kind =
    tag === "video" ? "background video" : tag === "img" || tag === "picture" ? "image" : /^h[1-6]$/.test(tag) || tag === "p" ? "text block" : tag ? `<${tag}> element` : "element";
  const sel = (node.selector ?? "").split(">").pop()?.trim();
  return sel ? `${kind} (${sel})` : kind;
}

const SUBPART_CAUSE: Record<string, (pct: number, el: string) => string> = {
  elementRenderDelay: (pct, el) =>
    `The largest element, the ${el}, is ready early but shown late: ${pct}% of its load time is render delay. It is waiting on JavaScript, a video or an animation before it appears.`,
  timeToFirstByte: (pct) =>
    `The server is slow to send the page: ${pct}% of the load time is spent waiting for the first byte.`,
  resourceLoadDelay: (pct, el) =>
    `The largest element, the ${el}, starts loading late (${pct}% of the load time): the browser finds it late or it is lazy-loaded.`,
  resourceLoadDuration: (pct, el) =>
    `The largest element, the ${el}, is slow to download (${pct}% of the load time): the file is too large.`,
};

export function buildPageSpeedReport(psi: unknown): PageSpeedReport {
  const lh = (psi as { lighthouseResult?: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, Audit> } } | null)
    ?.lighthouseResult;
  const audits = lh?.audits ?? {};
  const rawScore = lh?.categories?.performance?.score;
  const score = typeof rawScore === "number" ? Math.round(rawScore * 100) : null;
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const lcpMs = round(num(audits["largest-contentful-paint"]));
  const clsRaw = num(audits["cumulative-layout-shift"]);
  const cls = clsRaw === null ? null : Math.round(clsRaw * 1000) / 1000;
  const verdict = speedVerdict(score, lcpMs, cls);

  // ---- LCP breakdown + the element itself ------------------------------------
  const lcpItems = (audits["lcp-breakdown-insight"]?.details?.items ?? []) as {
    type?: string;
    items?: { subpart?: string; label?: string; duration?: number }[];
    snippet?: string;
    selector?: string;
  }[];
  const table = lcpItems.filter((i) => i.type === "table")[0];
  const node = lcpItems.filter((i) => i.type === "node")[0] ?? null;
  const parts = (table?.items ?? []).filter((p) => typeof p.duration === "number");
  const total = parts.reduce((s, p) => s + (p.duration ?? 0), 0);
  const lcpBreakdown = parts.map((p) => ({
    label: p.label ?? p.subpart ?? "",
    ms: Math.round(p.duration ?? 0),
    share: total > 0 ? Math.round(((p.duration ?? 0) / total) * 100) : 0,
  }));
  const largestElement = describeElement(node);

  let mainCause: string | null = null;
  if (verdict !== "good" && parts.length && total > 0) {
    const top = parts.slice().sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0]!;
    const pct = Math.round(((top.duration ?? 0) / total) * 100);
    const build = SUBPART_CAUSE[top.subpart ?? ""];
    if (build && pct >= 40) mainCause = build(pct, largestElement ?? "main content");
  }

  // ---- Google's own list of what to fix, largest estimated saving first --------
  const reasons: SpeedReason[] = [];
  Object.keys(audits).forEach((id) => {
    const a = audits[id]!;
    if (NOT_A_REASON[id]) return;
    if (a.score === null || a.score === undefined || a.score >= 0.9) return;
    const mode = a.scoreDisplayMode ?? "";
    if (mode === "notApplicable" || mode === "manual" || mode === "informative" || mode === "error") return;
    const s = a.metricSavings ?? {};
    const savingsMs = Math.round(Math.max(s.LCP ?? 0, s.FCP ?? 0, a.details?.overallSavingsMs ?? 0));
    let detail = a.displayValue ?? "";
    // Checklist audits (e.g. LCP discovery) name the failing items instead.
    const first = (a.details?.items ?? [])[0] as { type?: string; items?: Record<string, { label?: string; value?: boolean }> } | undefined;
    if (!detail && first?.type === "checklist" && first.items) {
      detail = Object.keys(first.items)
        .map((k) => first.items![k]!)
        .filter((c) => c.value === false && c.label)
        .map((c) => c.label!)
        .join("; ");
    }
    reasons.push({ id, title: a.title ?? id, detail, savingsMs });
  });
  reasons.sort((a, b) => b.savingsMs - a.savingsMs || (a.detail ? 0 : 1) - (b.detail ? 0 : 1));

  return {
    score,
    fcpMs: round(num(audits["first-contentful-paint"])),
    lcpMs,
    tbtMs: round(num(audits["total-blocking-time"])),
    cls,
    speedIndexMs: round(num(audits["speed-index"])),
    verdict,
    mainCause,
    largestElement,
    lcpBreakdown,
    reasons: reasons.slice(0, 6),
  };
}

const secs = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);

/** One line for the check result, including the cause when the page is not fast. */
export function pageSpeedDetail(r: PageSpeedReport): string {
  if (r.score === null) return "PageSpeed returned no performance score";
  const head = `Performance ${r.score}/100 · LCP ${secs(r.lcpMs)} · CLS ${r.cls ?? "n/a"}`;
  if (r.verdict === "good") return head;
  const fixes = r.reasons.slice(0, 3).map((x) => (x.detail ? `${x.title} (${x.detail})` : x.title));
  const label = r.verdict === "poor" ? "Slow" : "Could be faster";
  const parts: string[] = [];
  if (r.mainCause) parts.push(r.mainCause);
  if (fixes.length) parts.push(`${r.mainCause ? "Also: " : ""}${fixes.join("; ")}.`);
  return parts.length ? `${head}. ${label}: ${parts.join(" ")}`.slice(0, 900) : head;
}
