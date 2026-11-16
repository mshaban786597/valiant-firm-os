/**
 * Release verification: capture a page manifest (status, redirect, canonical,
 * robots, title, H1, schema, CTAs, viewport, forms) for a baseline and a
 * candidate, then compare field by field. Counts expected / checked / failed /
 * skipped, and declares what could not be checked instead of passing it.
 */
export interface PageManifest {
  url: string;
  reachable: boolean;
  status: number | null;
  finalPath: string | null;
  title: string | null;
  h1: string | null;
  canonicalPath: string | null;
  robots: string | null;
  schemaTypes: string[];
  ctaCount: number;
  hasViewport: boolean;
  formActions: string[];
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m && m[1] ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
}

function pathOf(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    return u.pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}

/** Pure: build a manifest from a fetched response. */
export function extractManifest(input: {
  url: string;
  status: number;
  finalUrl: string;
  html: string;
  xRobotsTag?: string | null;
}): PageManifest {
  const { html } = input;
  const metaRobots = (html.match(/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*>/i) ?? [])[0] ?? "";
  const robotsContent = /content\s*=\s*["']([^"']*)["']/i.exec(metaRobots)?.[1] ?? null;
  const canonicalTag = (html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i) ?? [])[0] ?? "";
  const canonicalHref = /href\s*=\s*["']([^"']+)["']/i.exec(canonicalTag)?.[1] ?? null;

  const schemaTypes: string[] = [];
  const ld = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ld.exec(html)) !== null) {
    const types = m[1]!.match(/"@type"\s*:\s*"([^"]+)"/g) ?? [];
    types.forEach((t) => {
      const name = /"@type"\s*:\s*"([^"]+)"/.exec(t)?.[1];
      if (name && schemaTypes.indexOf(name) === -1) schemaTypes.push(name);
    });
  }
  schemaTypes.sort();

  const ctaCount = (html.match(/href\s*=\s*["'](tel:|mailto:)[^"']+["']/gi) ?? []).length;
  const formActions: string[] = [];
  const forms = /<form\b[^>]*>/gi;
  while ((m = forms.exec(html)) !== null) {
    const action = /action\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? "";
    formActions.push(pathOf(action || input.finalUrl, input.finalUrl) ?? "");
  }

  return {
    url: input.url,
    reachable: true,
    status: input.status,
    finalPath: pathOf(input.finalUrl, input.url),
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    h1: firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    canonicalPath: pathOf(canonicalHref, input.finalUrl),
    robots: input.xRobotsTag ?? robotsContent,
    schemaTypes,
    ctaCount,
    hasViewport: /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html),
    formActions: formActions.sort(),
  };
}

export function unreachableManifest(url: string): PageManifest {
  return {
    url,
    reachable: false,
    status: null,
    finalPath: null,
    title: null,
    h1: null,
    canonicalPath: null,
    robots: null,
    schemaTypes: [],
    ctaCount: 0,
    hasViewport: false,
    formActions: [],
  };
}

export async function captureManifest(url: string, timeoutMs = 15_000): Promise<PageManifest> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "ValiantFirmReleaseCheck/1.0", accept: "text/html,*/*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = (await res.text()).slice(0, 2_000_000);
    return extractManifest({
      url,
      status: res.status,
      finalUrl: res.url || url,
      html,
      xRobotsTag: res.headers.get("x-robots-tag"),
    });
  } catch {
    return unreachableManifest(url);
  }
}

export type ItemResult = "pass" | "fail" | "skipped";
export interface CheckItem {
  path: string;
  check: string;
  expected: string;
  actual: string;
  result: ItemResult;
  note?: string;
}

export interface ReleaseComparison {
  expected: number;
  checked: number;
  failed: number;
  skipped: number;
  items: CheckItem[];
}

const FIELDS: { check: string; get: (m: PageManifest) => string; requires?: (m: PageManifest) => boolean }[] = [
  { check: "HTTP status", get: (m) => String(m.status) },
  { check: "Final path (redirects)", get: (m) => m.finalPath ?? "" },
  { check: "Title", get: (m) => m.title ?? "", requires: (m) => m.title !== null },
  { check: "H1", get: (m) => m.h1 ?? "", requires: (m) => m.h1 !== null },
  { check: "Canonical", get: (m) => m.canonicalPath ?? "", requires: (m) => m.canonicalPath !== null },
  { check: "Robots", get: (m) => (m.robots ?? "index").toLowerCase().replace(/\s+/g, "") },
  { check: "Schema types", get: (m) => m.schemaTypes.join(","), requires: (m) => m.schemaTypes.length > 0 },
  { check: "Call/email CTAs", get: (m) => String(m.ctaCount), requires: (m) => m.ctaCount > 0 },
  { check: "Mobile viewport", get: (m) => String(m.hasViewport) },
  { check: "Form routing", get: (m) => m.formActions.join(","), requires: (m) => m.formActions.length > 0 },
];

/**
 * Compare baseline and candidate manifests for mapped paths.
 *  - a check the baseline does not define (e.g. no schema on that page) is skipped
 *  - an unreachable page skips its remaining checks and fails reachability
 *  - `declaredDifferences` (check names expected to differ between environments,
 *    e.g. "Robots" on a noindexed staging site) are skipped with a note
 */
export function compareManifests(
  pairs: { path: string; baseline: PageManifest; candidate: PageManifest }[],
  declaredDifferences: string[] = [],
): ReleaseComparison {
  const items: CheckItem[] = [];
  pairs.forEach(({ path, baseline, candidate }) => {
    if (!baseline.reachable) {
      FIELDS.forEach((f) =>
        items.push({ path, check: f.check, expected: "unavailable", actual: "", result: "skipped", note: "Baseline page could not be fetched" }),
      );
      return;
    }
    if (!candidate.reachable) {
      items.push({ path, check: "Reachable", expected: "reachable", actual: "unreachable", result: "fail" });
      FIELDS.forEach((f) =>
        items.push({ path, check: f.check, expected: f.get(baseline), actual: "", result: "skipped", note: "Candidate page could not be fetched" }),
      );
      return;
    }
    FIELDS.forEach((f) => {
      const expected = f.get(baseline);
      if (declaredDifferences.indexOf(f.check) !== -1) {
        items.push({ path, check: f.check, expected, actual: f.get(candidate), result: "skipped", note: "Declared environment difference" });
        return;
      }
      if (f.requires && !f.requires(baseline)) {
        items.push({ path, check: f.check, expected: "not defined on baseline", actual: f.get(candidate), result: "skipped", note: "Nothing to compare" });
        return;
      }
      const actual = f.get(candidate);
      items.push({ path, check: f.check, expected, actual, result: expected === actual ? "pass" : "fail" });
    });
  });
  const skipped = items.filter((i) => i.result === "skipped").length;
  const failed = items.filter((i) => i.result === "fail").length;
  return { expected: items.length, checked: items.length - skipped, failed, skipped, items };
}

/** Fetch both environments for each mapped path and compare. */
export async function verifyRelease(input: {
  baselineOrigin: string;
  candidateOrigin: string;
  paths: string[];
  declaredDifferences?: string[];
}): Promise<ReleaseComparison> {
  const join = (origin: string, path: string) => origin.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
  const pairs = await Promise.all(
    input.paths.map(async (path) => {
      const [baseline, candidate] = await Promise.all([
        captureManifest(join(input.baselineOrigin, path)),
        captureManifest(join(input.candidateOrigin, path)),
      ]);
      return { path, baseline, candidate };
    }),
  );
  return compareManifests(pairs, input.declaredDifferences ?? []);
}
