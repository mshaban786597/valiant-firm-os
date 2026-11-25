/**
 * Detailed page-speed diagnosis for one or more URLs: the largest element,
 * which files block rendering, unused JavaScript/CSS, oversized images, cache
 * lifetimes and page weight, straight from Google's PageSpeed report, plus how
 * the page's HTML loads its hero and scripts. Read-only.
 *
 *   npx tsx --env-file=.env scripts/speed-diagnose.ts https://site-a.com https://site-b.com
 */
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import { buildPageSpeedReport } from "@/lib/monitoring/pagespeed";

type Item = Record<string, unknown>;
const short = (u: unknown) => String(u ?? "").replace(/^https?:\/\/[^/]+/, "").slice(0, 90) || String(u ?? "");
const kb = (b: unknown) => `${Math.round(Number(b ?? 0) / 1024)} KB`;

function tableItems(audit: { details?: { items?: Item[] } } | undefined): Item[] {
  const items = audit?.details?.items ?? [];
  // Insight audits nest a table inside a list.
  const nested = items.filter((i) => Array.isArray((i as { items?: unknown }).items));
  return nested.length ? ((nested[0] as { items: Item[] }).items ?? []) : items;
}

async function diagnose(url: string, token: string) {
  const api =
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" +
    encodeURIComponent(url) +
    "&strategy=mobile&category=performance";
  const [psiRes, htmlRes] = await Promise.all([
    fetch(api, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(150_000) }),
    fetch(url, { headers: { "user-agent": "ValiantFirmMonitor/1.0" }, signal: AbortSignal.timeout(45_000) }),
  ]);
  const psi = (await psiRes.json()) as { lighthouseResult?: { audits?: Record<string, { details?: { items?: Item[] }; displayValue?: string }> } };
  const html = await htmlRes.text();
  const a = psi.lighthouseResult?.audits ?? {};
  const r = buildPageSpeedReport(psi);
  const out: string[] = [];
  out.push(`\n################ ${url}`);
  out.push(`score ${r.score} · LCP ${r.lcpMs}ms · FCP ${r.fcpMs}ms · TBT ${r.tbtMs}ms · CLS ${r.cls} · verdict ${r.verdict}`);
  out.push(`largest element: ${r.largestElement}`);
  out.push(`LCP breakdown: ${r.lcpBreakdown.map((p) => `${p.label} ${p.ms}ms (${p.share}%)`).join(" | ")}`);

  const node = (a["lcp-breakdown-insight"]?.details?.items ?? []).filter((i) => i.type === "node")[0];
  out.push(`LCP snippet: ${String(node?.snippet ?? "").slice(0, 260)}`);
  const checklist = ((a["lcp-discovery-insight"]?.details?.items ?? [])[0] as { items?: Record<string, { label: string; value: boolean }> } | undefined)?.items;
  if (checklist) out.push(`LCP discovery: ${Object.keys(checklist).map((k) => `${checklist[k]!.label}=${checklist[k]!.value ? "ok" : "MISSING"}`).join(" | ")}`);

  const list = (title: string, id: string, fmt: (i: Item) => string, max = 6) => {
    const items = tableItems(a[id]);
    if (!items.length) return;
    out.push(`${title}${a[id]?.displayValue ? ` [${a[id]!.displayValue}]` : ""}:`);
    items.slice(0, max).forEach((i) => out.push(`   - ${fmt(i)}`));
  };
  list("Render-blocking", "render-blocking-insight", (i) => `${short(i.url)} ${kb(i.totalBytes)} wasted ${Math.round(Number(i.wastedMs ?? 0))}ms`);
  list("Unused JavaScript", "unused-javascript", (i) => `${short(i.url)} unused ${kb(i.wastedBytes)} of ${kb(i.totalBytes)}`);
  list("Unused CSS", "unused-css-rules", (i) => `${short(i.url)} unused ${kb(i.wastedBytes)} of ${kb(i.totalBytes)}`);
  list("Image delivery", "image-delivery-insight", (i) => `${short(i.url)} could save ${kb(i.wastedBytes)} of ${kb(i.totalBytes)}`);
  list("Short cache lifetime", "cache-insight", (i) => `${short(i.url)} ${kb(i.totalBytes)} ttl ${Math.round(Number(i.cacheLifetimeMs ?? 0) / 3_600_000)}h`, 5);
  list("Heaviest files", "total-byte-weight", (i) => `${short(i.url)} ${kb(i.totalBytes)}`, 6);
  list("Third parties", "third-parties-insight", (i) => `${String(i.entity ?? "")} ${kb(i.transferSize)} main-thread ${Math.round(Number(i.mainThreadTime ?? 0))}ms`, 5);
  list("Font display", "font-display-insight", (i) => `${short(i.url)} wasted ${Math.round(Number(i.wastedMs ?? 0))}ms`, 4);
  list("Legacy JavaScript", "legacy-javascript-insight", (i) => `${short(i.url)} ${kb(i.wastedBytes)}`, 3);

  // How the page is built and how the hero loads.
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? "";
  const hints: string[] = [];
  if (gen) hints.push(`generator: ${gen}`);
  if (/wp-content|wp-includes/i.test(html)) hints.push("WordPress");
  if (/elementor/i.test(html)) hints.push("Elementor");
  if (/_next\/static/i.test(html)) hints.push("Next.js");
  if (/cdn\.shopify|shopify/i.test(html)) hints.push("Shopify");
  if (/wixstatic|wix\.com/i.test(html)) hints.push("Wix");
  if (/squarespace/i.test(html)) hints.push("Squarespace");
  if (/\.php["'?]/i.test(html)) hints.push("PHP");
  out.push(`platform hints: ${hints.join(", ") || "plain HTML / unknown"} · server: ${htmlRes.headers.get("server") ?? "?"} · html ${kb(html.length)}`);
  out.push(`scripts in <head> without defer/async: ${(html.split(/<\/head>/i)[0]?.match(/<script\b(?![^>]*\b(defer|async|type=["']module))[^>]*\bsrc=/gi) ?? []).length} · stylesheets: ${(html.match(/<link[^>]+rel=["']stylesheet["']/gi) ?? []).length} · preload tags: ${(html.match(/<link[^>]+rel=["']preload["']/gi) ?? []).length}`);
  const hero = /<(video|img)\b[^>]*(hero|banner|masthead)[^>]*>/i.exec(html)?.[0] ?? /<(img|video)\b[^>]*>/i.exec(html.split(/<main|<body/i)[1] ?? html)?.[0] ?? "";
  out.push(`first hero-like tag: ${hero.slice(0, 300)}`);
  out.push(`lazy images: ${(html.match(/loading=["']lazy["']/gi) ?? []).length} · fetchpriority=high: ${(html.match(/fetchpriority=["']high["']/gi) ?? []).length} · reveal/animation classes: ${(html.match(/class=["'][^"']*(reveal|fade|aos|animate|wow)\b/gi) ?? []).length}`);
  return out.join("\n");
}

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) throw new Error("Usage: speed-diagnose <url> [url...]");
  const t = await getGoogleAccessToken(["openid"]);
  if (!t.ok) throw new Error(t.detail);
  for (let i = 0; i < urls.length; i += 3) {
    const batch = await Promise.all(urls.slice(i, i + 3).map((u) => diagnose(u, t.token).catch((e) => `\n################ ${u}\nFAILED: ${e instanceof Error ? e.message : e}`)));
    batch.forEach((b) => console.log(b));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
