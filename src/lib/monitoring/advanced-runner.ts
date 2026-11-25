import tls from "node:tls";
import type { CheckResult } from "@/lib/monitoring/incidents";
import { extractLinks } from "@/lib/monitoring/analyzers";
import {
  certVerdict,
  endpointReachable,
  extractForms,
  hasContactField,
  median,
  pageFacts,
  parseSitemap,
  responseVerdict,
  summarizeCrawl,
  type AdvancedKind,
  type BrokenLink,
  type CrawledPage,
} from "@/lib/monitoring/advanced";

const UA = "ValiantFirmMonitor/1.0 (+https://app.valiantfirm.net)";
const toUrl = (t: string) => (t.startsWith("http") ? t : `https://${t}`);

async function get(url: string, timeoutMs: number, method = "GET") {
  const started = Date.now();
  const res = await fetch(url, {
    method,
    redirect: "follow",
    headers: { "user-agent": UA, accept: "text/html,application/xml,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { res, ms: Date.now() - started };
}

/** Run items through `fn` with bounded concurrency, stopping when the deadline passes. */
async function pool<T, R>(items: T[], limit: number, deadline: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length && Date.now() < deadline) {
      const item = items[i++]!;
      out.push(await fn(item));
    }
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// ---- SSL certificate expiry ---------------------------------------------------
function readCertificate(host: string): Promise<{ validTo: Date; issuer: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return reject(new Error("No certificate presented"));
      const issuer = (cert.issuer as { O?: string; CN?: string } | undefined) ?? {};
      resolve({ validTo: new Date(cert.valid_to), issuer: issuer.O ?? issuer.CN ?? "unknown issuer" });
    });
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS connection timed out"));
    });
  });
}

async function sslExpiry(target: string): Promise<CheckResult> {
  const host = new URL(toUrl(target)).hostname;
  const cert = await readCertificate(host);
  const v = certVerdict(cert.validTo, cert.issuer);
  return { status: v.ok ? "ok" : "fail", detail: v.detail, affectedObject: host, checkKind: "ssl_expiry" };
}

// ---- response time trend ------------------------------------------------------
async function responseTime(target: string, state: unknown): Promise<CheckResult> {
  const url = toUrl(target);
  const samples: number[] = [];
  let status = 0;
  for (let i = 0; i < 3; i++) {
    const { res, ms } = await get(url, 12_000);
    await res.arrayBuffer(); // include the body transfer
    status = res.status;
    samples.push(ms);
  }
  const current = median(samples)!;
  const history = ((state as { history?: number[] } | null)?.history ?? []).filter((n) => typeof n === "number");
  const v = responseVerdict(current, history);
  return {
    status: v.ok ? "ok" : "fail",
    statusCode: status,
    latencyMs: current,
    detail: `${v.detail}; 3 samples ${samples.join("/")}ms`,
    affectedObject: url,
    checkKind: "response_time",
    // Rolling window of the last 30 medians is the site's own baseline.
    state: { history: history.concat(current).slice(-30) },
  };
}

// ---- full-site crawl from the sitemap -----------------------------------------
async function findSitemapUrls(origin: string, deadline: number): Promise<string[]> {
  const candidates: string[] = [];
  try {
    const { res } = await get(`${origin}/robots.txt`, 8_000);
    if (res.ok) {
      const txt = await res.text();
      const re = /^sitemap\s*:\s*(\S+)/gim;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt)) !== null) candidates.push(m[1]!);
    }
  } catch {
    /* fall through to the default location */
  }
  if (candidates.length === 0) candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);

  const urls: string[] = [];
  const seen: Record<string, true> = {};
  const queue = candidates.slice();
  while (queue.length && Date.now() < deadline && Object.keys(seen).length < 12) {
    const sm = queue.shift()!;
    if (seen[sm]) continue;
    seen[sm] = true;
    try {
      const { res } = await get(sm, 10_000);
      if (!res.ok) continue;
      const parsed = parseSitemap(await res.text());
      parsed.sitemaps.forEach((s) => queue.push(s));
      parsed.urls.forEach((u) => {
        if (urls.indexOf(u) === -1) urls.push(u);
      });
    } catch {
      /* skip an unreadable sitemap */
    }
  }
  return urls;
}

async function siteCrawl(target: string): Promise<CheckResult> {
  const url = toUrl(target);
  const origin = new URL(url).origin;
  const host = new URL(url).host;
  const deadline = Date.now() + 40_000; // stay inside the function time limit
  const MAX_PAGES = 200;

  const sitemapUrls = (await findSitemapUrls(origin, deadline)).filter((u) => {
    try {
      return new URL(u).host.replace(/^www\./, "") === host.replace(/^www\./, "");
    } catch {
      return false;
    }
  });
  if (sitemapUrls.length === 0) {
    return {
      status: "unknown",
      detail: "No sitemap found, so the site could not be crawled. Add a sitemap.xml or list it in robots.txt.",
      affectedObject: url,
      checkKind: "site_crawl",
    };
  }

  const toCrawl = sitemapUrls.slice(0, MAX_PAGES);
  const linkSources: Record<string, string> = {};
  const pages = await pool<string, CrawledPage>(toCrawl, 8, deadline, async (pageUrl) => {
    try {
      const { res } = await get(pageUrl, 10_000);
      const html = res.status < 400 ? (await res.text()).slice(0, 1_500_000) : "";
      if (html) {
        extractLinks(html, res.url || pageUrl, 300).forEach((l) => {
          try {
            if (new URL(l).host.replace(/^www\./, "") !== host.replace(/^www\./, "")) return;
          } catch {
            return;
          }
          if (/\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|woff2?|ttf|mp4|zip)(\?|$)/i.test(l)) return;
          if (!linkSources[l]) linkSources[l] = pageUrl;
        });
      }
      const facts = html ? pageFacts(html, res.headers.get("x-robots-tag")) : { title: null, issues: [] };
      return { url: pageUrl, status: res.status, title: facts.title, issues: facts.issues };
    } catch {
      return { url: pageUrl, status: 0, title: null, issues: [] }; // unreachable: not counted as broken
    }
  });

  // Internal links that are not themselves sitemap pages still need to resolve.
  const crawled: Record<string, true> = {};
  toCrawl.forEach((u) => (crawled[u.replace(/\/$/, "")] = true));
  const extra = Object.keys(linkSources)
    .filter((l) => !crawled[l.replace(/\/$/, "")])
    .slice(0, 300);
  const linkResults = await pool<string, BrokenLink | null>(extra, 10, deadline, async (link) => {
    try {
      const { res } = await get(link, 8_000);
      return res.status === 404 || res.status === 410 || res.status >= 500
        ? { url: link, status: res.status, from: linkSources[link]! }
        : null;
    } catch {
      return null;
    }
  });
  const brokenLinks = linkResults.filter((b): b is BrokenLink => b !== null);

  const partial = pages.length < toCrawl.length || sitemapUrls.length > MAX_PAGES;
  const summary = summarizeCrawl(pages, brokenLinks, sitemapUrls.length, partial);
  return {
    status: summary.ok ? "ok" : "fail",
    detail: summary.detail,
    affectedObject: origin,
    checkKind: "site_crawl",
    state: { findings: summary.findings, crawledAt: new Date().toISOString() },
  };
}

// ---- lead form routing (never submits) -----------------------------------------
async function leadForm(target: string): Promise<CheckResult> {
  const url = toUrl(target);
  const { res } = await get(url, 12_000);
  if (res.status >= 400) {
    return { status: "fail", statusCode: res.status, detail: `Form page returned HTTP ${res.status}`, affectedObject: url, checkKind: "form" };
  }
  const forms = extractForms(await res.text(), res.url || url);
  if (forms.length === 0) {
    return { status: "fail", statusCode: res.status, detail: "No lead form found on this page", affectedObject: url, checkKind: "form" };
  }
  const form = forms.filter((f) => hasContactField(f.fields))[0] ?? forms[0]!;
  // Probe the handler with GET only. A real submission would create a real lead,
  // so this check proves routing, not delivery.
  let endpointStatus = 0;
  try {
    const probe = await get(form.action, 10_000);
    endpointStatus = probe.res.status;
  } catch {
    endpointStatus = 0;
  }
  const path = (() => {
    try {
      return new URL(form.action).pathname;
    } catch {
      return form.action;
    }
  })();
  const problems: string[] = [];
  if (!endpointReachable(endpointStatus)) {
    problems.push(endpointStatus === 0 ? `handler ${path} did not answer` : `handler ${path} returned HTTP ${endpointStatus}`);
  }
  if (!hasContactField(form.fields)) problems.push("form has no email or phone field");
  return {
    status: problems.length ? "fail" : "ok",
    statusCode: res.status,
    detail: problems.length
      ? `Lead form problem: ${problems.join("; ")}`
      : `Lead form posts to ${path} (handler answers HTTP ${endpointStatus}); fields: ${form.fields.slice(0, 6).join(", ")}. Routing only: no test lead was submitted.`,
    affectedObject: url,
    checkKind: "form",
  };
}

export async function runAdvancedCheck(kind: AdvancedKind, target: string, state: unknown): Promise<CheckResult> {
  switch (kind) {
    case "SSL_EXPIRY":
      return sslExpiry(target);
    case "RESPONSE_TIME":
      return responseTime(target, state);
    case "SITE_CRAWL":
      return siteCrawl(target);
    case "FORM":
      return leadForm(target);
  }
}
