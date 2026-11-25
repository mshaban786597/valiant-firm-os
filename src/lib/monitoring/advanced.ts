/**
 * Pure rules for the deeper site checks: certificate expiry, sitemap crawl,
 * response-time trend and lead-form routing. No network, no DB.
 */

/** Check kinds that go beyond the base MonitorType enum. Stored in Monitor.kind. */
export const ADVANCED_KINDS = ["SSL_EXPIRY", "SITE_CRAWL", "RESPONSE_TIME", "FORM"] as const;
export type AdvancedKind = (typeof ADVANCED_KINDS)[number];

export function isAdvancedKind(kind: string | null | undefined): kind is AdvancedKind {
  return !!kind && (ADVANCED_KINDS as readonly string[]).indexOf(kind) !== -1;
}

/** The kind a check actually runs as: the stored kind when present, else its base type. */
export function effectiveKind(m: { type: string; kind?: string | null }): string {
  return m.kind ?? m.type;
}

// ---- certificate expiry ------------------------------------------------------
export interface CertVerdict {
  ok: boolean;
  daysLeft: number;
  detail: string;
}

/** Fails when the certificate has expired or expires within `warnDays`. */
export function certVerdict(validTo: Date, issuer: string, now: Date = new Date(), warnDays = 14): CertVerdict {
  const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
  const date = validTo.toISOString().slice(0, 10);
  if (daysLeft < 0) {
    return { ok: false, daysLeft, detail: `Certificate expired ${-daysLeft} day(s) ago (${date}); issuer ${issuer}` };
  }
  if (daysLeft <= warnDays) {
    return { ok: false, daysLeft, detail: `Certificate expires in ${daysLeft} day(s) (${date}); issuer ${issuer}` };
  }
  return { ok: true, daysLeft, detail: `Certificate valid for ${daysLeft} more days (expires ${date}); issuer ${issuer}` };
}

// ---- response time -------------------------------------------------------------
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export interface ResponseVerdict {
  ok: boolean;
  baselineMs: number | null;
  detail: string;
}

/**
 * Slow when the measured time is over the absolute limit, or when it is more
 * than `factor` times the site's own recent baseline (and at least
 * `minDeltaMs` slower, so small sites do not alarm on noise). The baseline
 * needs 5 earlier measurements; before that only the absolute limit applies.
 */
export function responseVerdict(
  currentMs: number,
  history: number[],
  opts: { maxMs?: number; factor?: number; minDeltaMs?: number } = {},
): ResponseVerdict {
  const maxMs = opts.maxMs ?? 3000;
  const factor = opts.factor ?? 2;
  const minDeltaMs = opts.minDeltaMs ?? 800;
  const baselineMs = history.length >= 5 ? median(history) : null;
  if (currentMs > maxMs) {
    return { ok: false, baselineMs, detail: `Slow: ${currentMs}ms (limit ${maxMs}ms)` };
  }
  if (baselineMs !== null && currentMs > baselineMs * factor && currentMs - baselineMs >= minDeltaMs) {
    return {
      ok: false,
      baselineMs,
      detail: `Slower than usual: ${currentMs}ms vs usual ${baselineMs}ms (last ${history.length} checks)`,
    };
  }
  return {
    ok: true,
    baselineMs,
    detail:
      baselineMs === null
        ? `${currentMs}ms (building a baseline: ${history.length} of 5 measurements)`
        : `${currentMs}ms (usual ${baselineMs}ms)`,
  };
}

// ---- sitemap -------------------------------------------------------------------
/** Parse a sitemap or sitemap index. Returns page URLs and nested sitemap URLs. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = (block: string) => {
    const out: string[] = [];
    const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) out.push(m[1]!.replace(/&amp;/g, "&"));
    return out;
  };
  const sitemaps: string[] = [];
  const idx = /<sitemap\b[\s\S]*?<\/sitemap>/gi;
  let m: RegExpExecArray | null;
  while ((m = idx.exec(xml)) !== null) locs(m[0]).forEach((u) => sitemaps.push(u));
  const urls: string[] = [];
  const pages = /<url\b[\s\S]*?<\/url>/gi;
  while ((m = pages.exec(xml)) !== null) {
    const first = locs(m[0])[0];
    if (first && urls.indexOf(first) === -1) urls.push(first);
  }
  return { urls, sitemaps };
}

// ---- on-page issues ---------------------------------------------------------------
export interface PageFacts {
  title: string | null;
  issues: string[];
}

export function pageFacts(html: string, xRobotsTag?: string | null): PageFacts {
  const issues: string[] = [];
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? titleMatch[1]!.replace(/\s+/g, " ").trim() : null;
  if (!title) issues.push("missing title");
  if (!/<h1\b/i.test(html)) issues.push("missing H1");
  if (!/<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(html)) issues.push("missing canonical");
  const metaRobots = (html.match(/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*>/i) ?? [])[0] ?? "";
  if (/noindex/i.test(metaRobots) || (xRobotsTag && /noindex/i.test(xRobotsTag))) issues.push("noindex");
  return { title, issues };
}

export interface CrawledPage {
  url: string;
  status: number;
  title: string | null;
  issues: string[];
}
export interface BrokenLink {
  url: string;
  status: number;
  from: string;
}

export interface CrawlSummary {
  ok: boolean;
  detail: string;
  findings: {
    pagesInSitemap: number;
    pagesCrawled: number;
    partial: boolean;
    brokenPages: { url: string; status: number }[];
    brokenLinks: BrokenLink[];
    noindexInSitemap: string[];
    missingTitle: string[];
    missingH1: string[];
    missingCanonical: string[];
    duplicateTitles: { title: string; urls: string[] }[];
  };
}

const broken = (status: number) => status === 404 || status === 410 || status >= 500;

/**
 * Fails on anything that loses traffic or leads: a sitemap page that is broken
 * or set to noindex, or a broken internal link. Missing titles / H1s /
 * canonicals and duplicate titles are reported as findings without failing.
 */
export function summarizeCrawl(
  pages: CrawledPage[],
  brokenLinks: BrokenLink[],
  pagesInSitemap: number,
  partial: boolean,
): CrawlSummary {
  const brokenPages = pages.filter((p) => broken(p.status)).map((p) => ({ url: p.url, status: p.status }));
  const live = pages.filter((p) => !broken(p.status));
  const withIssue = (issue: string) => live.filter((p) => p.issues.indexOf(issue) !== -1).map((p) => p.url);

  const byTitle: Record<string, string[]> = {};
  live.forEach((p) => {
    if (!p.title) return;
    const key = p.title.toLowerCase();
    (byTitle[key] = byTitle[key] ?? []).push(p.url);
  });
  const duplicateTitles = Object.keys(byTitle)
    .filter((t) => byTitle[t]!.length > 1)
    .map((t) => ({ title: t, urls: byTitle[t]! }));

  const findings = {
    pagesInSitemap,
    pagesCrawled: pages.length,
    partial,
    brokenPages,
    brokenLinks: brokenLinks.slice(0, 50),
    noindexInSitemap: withIssue("noindex"),
    missingTitle: withIssue("missing title"),
    missingH1: withIssue("missing H1"),
    missingCanonical: withIssue("missing canonical"),
    duplicateTitles,
  };

  const failing: string[] = [];
  if (brokenPages.length) failing.push(`${brokenPages.length} broken page(s)`);
  if (brokenLinks.length) failing.push(`${brokenLinks.length} broken internal link(s)`);
  if (findings.noindexInSitemap.length) failing.push(`${findings.noindexInSitemap.length} sitemap page(s) set to noindex`);

  const notes: string[] = [];
  if (findings.missingTitle.length) notes.push(`${findings.missingTitle.length} without a title`);
  if (findings.missingH1.length) notes.push(`${findings.missingH1.length} without an H1`);
  if (findings.missingCanonical.length) notes.push(`${findings.missingCanonical.length} without a canonical`);
  if (duplicateTitles.length) notes.push(`${duplicateTitles.length} duplicate title group(s)`);

  const scope = partial
    ? `${pages.length} of ${pagesInSitemap} sitemap pages crawled (time limit reached)`
    : `${pages.length} sitemap pages crawled`;
  const first = brokenPages[0]
    ? ` First: ${brokenPages[0].url} (${brokenPages[0].status}).`
    : brokenLinks[0]
      ? ` First: ${brokenLinks[0].url} (${brokenLinks[0].status}) linked from ${brokenLinks[0].from}.`
      : "";
  const detail =
    `${scope}: ` +
    (failing.length ? failing.join(", ") : "no broken pages or links") +
    (notes.length ? `; also ${notes.join(", ")}` : "") +
    "." +
    first;
  return { ok: failing.length === 0, detail: detail.slice(0, 480), findings };
}

// ---- lead forms -------------------------------------------------------------------
export interface FormInfo {
  action: string;
  method: string;
  fields: string[];
}

/** Lead forms on a page (site-search forms are ignored). */
export function extractForms(html: string, baseUrl: string): FormInfo[] {
  const out: FormInfo[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1]!;
    const body = m[2]!;
    if (/role\s*=\s*["']search["']/i.test(attrs)) continue;
    const fields: string[] = [];
    const inputs = /<(?:input|textarea|select)\b([^>]*)>/gi;
    let f: RegExpExecArray | null;
    while ((f = inputs.exec(body)) !== null) {
      const type = /type\s*=\s*["']([^"']+)["']/i.exec(f[1]!)?.[1]?.toLowerCase() ?? "text";
      const name = /name\s*=\s*["']([^"']+)["']/i.exec(f[1]!)?.[1];
      if (!name || type === "hidden" || type === "submit" || type === "button") continue;
      if (fields.indexOf(name) === -1) fields.push(name);
    }
    if (fields.length === 0) continue;
    if (fields.length === 1 && /^(s|q|search|query)$/i.test(fields[0]!)) continue;
    const rawAction = /action\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
    let action = baseUrl;
    try {
      action = new URL(rawAction || baseUrl, baseUrl).toString();
    } catch {
      /* keep page URL */
    }
    const method = (/method\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "get").toLowerCase();
    out.push({ action, method, fields });
  }
  return out;
}

/** Does the form collect a way to contact the lead? */
export function hasContactField(fields: string[]): boolean {
  return fields.some((f) => /(email|phone|tel|mobile)/i.test(f));
}

/**
 * A form endpoint counts as reachable when it answers at all without a
 * not-found or server error. 405 (method not allowed on GET) is the normal
 * answer from a POST-only handler.
 */
export function endpointReachable(status: number): boolean {
  return status !== 404 && status !== 410 && status < 500 && status !== 0;
}
