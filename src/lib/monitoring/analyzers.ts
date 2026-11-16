import crypto from "node:crypto";

/**
 * Pure analyzers for website checks. No network, no DB — the runner fetches,
 * these decide. Kept pure so every rule is unit-tested.
 */

export interface Analysis {
  ok: boolean;
  issues: string[];
}

// ---- security headers ----------------------------------------------------
const REQUIRED_SECURITY_HEADERS: { header: string; label: string }[] = [
  { header: "strict-transport-security", label: "HSTS" },
  { header: "x-content-type-options", label: "X-Content-Type-Options" },
  { header: "content-security-policy", label: "Content-Security-Policy" },
];

/** HTTPS + core security headers. Fails on plain HTTP or 2+ missing headers. */
export function analyzeSecurity(
  finalUrl: string,
  headers: Record<string, string | undefined>,
): Analysis {
  const issues: string[] = [];
  if (!finalUrl.toLowerCase().startsWith("https://")) issues.push("Not served over HTTPS");
  const lower: Record<string, string | undefined> = {};
  Object.keys(headers).forEach((k) => (lower[k.toLowerCase()] = headers[k]));
  const missing = REQUIRED_SECURITY_HEADERS.filter((h) => !lower[h.header]).map((h) => h.label);
  // Clickjacking protection can come from either header.
  const csp = lower["content-security-policy"] ?? "";
  if (!lower["x-frame-options"] && !/frame-ancestors/i.test(csp)) missing.push("X-Frame-Options");
  missing.forEach((m) => issues.push(`Missing ${m}`));
  const insecure = issues.some((i) => i.startsWith("Not served"));
  return { ok: !insecure && missing.length < 2, issues };
}

// ---- links ---------------------------------------------------------------
/** Extract unique absolute http(s) links from HTML, internal links first. */
export function extractLinks(html: string, baseUrl: string, limit = 20): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const seen: Record<string, true> = {};
  const internal: string[] = [];
  const external: string[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!.trim();
    if (/^(mailto:|tel:|javascript:|data:|sms:)/i.test(raw)) continue;
    let abs: URL;
    try {
      abs = new URL(raw, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    abs.hash = "";
    const key = abs.toString();
    if (seen[key]) continue;
    seen[key] = true;
    (abs.host === base.host ? internal : external).push(key);
  }
  return internal.concat(external).slice(0, limit);
}

/** A link counts as broken on 404/410 or any 5xx. Bot-blocks (401/403/429) do not. */
export function isBrokenStatus(status: number): boolean {
  return status === 404 || status === 410 || status >= 500;
}

// ---- indexing ------------------------------------------------------------
/** True when robots.txt blocks the whole site for all crawlers. */
export function robotsBlocksAll(robotsTxt: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
  let applies = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const ua = /^user-agent\s*:\s*(.+)$/i.exec(line);
    if (ua) {
      applies = ua[1]!.trim() === "*";
      continue;
    }
    if (applies && /^disallow\s*:\s*\/\s*$/i.test(line)) return true;
  }
  return false;
}

export function hasNoindex(html: string, xRobotsTag?: string | null): boolean {
  if (xRobotsTag && /noindex/i.test(xRobotsTag)) return true;
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  return metas.some(
    (tag) => /name\s*=\s*["'](robots|googlebot)["']/i.test(tag) && /noindex/i.test(tag),
  );
}

export function analyzeIndexing(input: {
  html: string;
  xRobotsTag?: string | null;
  robotsTxt: string | null;
  sitemapFound: boolean;
}): Analysis {
  const issues: string[] = [];
  if (hasNoindex(input.html, input.xRobotsTag)) issues.push("Page is set to noindex");
  if (input.robotsTxt !== null && robotsBlocksAll(input.robotsTxt)) {
    issues.push("robots.txt blocks all crawlers (Disallow: /)");
  }
  const blocking = issues.length > 0;
  if (!input.sitemapFound) issues.push("No sitemap.xml found");
  // A missing sitemap alone is a warning in the detail, not a failure.
  return { ok: !blocking, issues };
}

// ---- mobile --------------------------------------------------------------
export function analyzeMobile(html: string): Analysis {
  const issues: string[] = [];
  const viewport = (html.match(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i) ?? [])[0];
  if (!viewport) issues.push("No viewport meta tag");
  else if (!/width\s*=\s*device-width/i.test(viewport)) issues.push("Viewport is not device-width");
  return { ok: issues.length === 0, issues };
}

// ---- content change ------------------------------------------------------
/** Hash of the page's visible text (scripts/styles/markup stripped). */
export function contentHash(html: string): string {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ---- page speed (PageSpeed Insights v5 response) -------------------------
export interface PageSpeedSummary {
  score: number | null; // 0-100
  lcpMs: number | null;
  cls: number | null;
  ok: boolean;
  detail: string;
}

export function summarizePageSpeed(psi: unknown, minScore = 50): PageSpeedSummary {
  const lh = (psi as { lighthouseResult?: Record<string, unknown> } | null)?.lighthouseResult as
    | {
        categories?: { performance?: { score?: number | null } };
        audits?: Record<string, { numericValue?: number }>;
      }
    | undefined;
  const raw = lh?.categories?.performance?.score;
  const score = typeof raw === "number" ? Math.round(raw * 100) : null;
  const lcp = lh?.audits?.["largest-contentful-paint"]?.numericValue;
  const clsV = lh?.audits?.["cumulative-layout-shift"]?.numericValue;
  const lcpMs = typeof lcp === "number" ? Math.round(lcp) : null;
  const cls = typeof clsV === "number" ? Math.round(clsV * 1000) / 1000 : null;
  if (score === null) {
    return { score, lcpMs, cls, ok: true, detail: "PageSpeed returned no performance score" };
  }
  const parts = [`Performance ${score}/100`];
  if (lcpMs !== null) parts.push(`LCP ${(lcpMs / 1000).toFixed(1)}s`);
  if (cls !== null) parts.push(`CLS ${cls}`);
  return { score, lcpMs, cls, ok: score >= minScore, detail: parts.join(" · ") };
}

// ---- website suite -------------------------------------------------------
export interface SuiteMonitor {
  type:
    | "UPTIME"
    | "DNS"
    | "TLS"
    | "PAGE_SPEED"
    | "BROKEN_LINKS"
    | "SECURITY"
    | "INDEXING"
    | "CONTENT_CHANGE"
    | "MOBILE";
  label: string;
  cadenceMinutes: number;
}

/** The full set of monitors created when a website is added. */
export const WEBSITE_SUITE: SuiteMonitor[] = [
  { type: "UPTIME", label: "Uptime", cadenceMinutes: 15 },
  { type: "DNS", label: "DNS", cadenceMinutes: 60 },
  { type: "TLS", label: "HTTPS / TLS", cadenceMinutes: 720 },
  { type: "INDEXING", label: "Indexing status", cadenceMinutes: 360 },
  { type: "CONTENT_CHANGE", label: "Content changes", cadenceMinutes: 60 },
  { type: "BROKEN_LINKS", label: "Broken links", cadenceMinutes: 1440 },
  { type: "SECURITY", label: "Security headers", cadenceMinutes: 1440 },
  { type: "MOBILE", label: "Mobile usability", cadenceMinutes: 1440 },
  { type: "PAGE_SPEED", label: "Page speed & Core Web Vitals", cadenceMinutes: 1440 },
];

/** Normalize user input ("example.com", "http://x.com/") into an https URL. */
export function normalizeSiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}
