import dns from "node:dns/promises";
import { MonitorType, type Monitor } from "@prisma/client";
import type { CheckResult } from "@/lib/monitoring/incidents";
import {
  analyzeIndexing,
  analyzeMobile,
  analyzeSecurity,
  contentHash,
  extractLinks,
  isBrokenStatus,
} from "@/lib/monitoring/analyzers";
import { isAdvancedKind } from "@/lib/monitoring/advanced";
import { runAdvancedCheck } from "@/lib/monitoring/advanced-runner";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import { buildPageSpeedReport, pageSpeedDetail } from "@/lib/monitoring/pagespeed";

type MonitorLike = Pick<Monitor, "type" | "target"> & { state?: unknown; kind?: string | null };

const UA = "ValiantFirmMonitor/1.0 (+https://app.valiantfirm.net)";

function toUrl(target: string): string {
  return target.startsWith("http") ? target : `https://${target}`;
}

async function fetchPage(url: string, timeoutMs = 12_000) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const html = (await res.text()).slice(0, 1_500_000);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  return { res, html, headers, finalUrl: res.url || url };
}

/**
 * Execute a monitor's check and return a normalized result. Every type except
 * LEAD_ROUTE/CUSTOM runs a real probe against the live site.
 */
export async function runMonitorCheck(monitor: MonitorLike): Promise<CheckResult> {
  const checkKind = (monitor.kind ?? monitor.type).toLowerCase();
  const url = toUrl(monitor.target);

  try {
    if (isAdvancedKind(monitor.kind)) {
      return await runAdvancedCheck(monitor.kind, monitor.target, monitor.state);
    }
    switch (monitor.type) {
      case MonitorType.UPTIME:
      case MonitorType.ROUTE:
      case MonitorType.TLS: {
        const started = Date.now();
        const res = await fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - started;
        const ok = res.status < 400;
        return {
          status: ok ? "ok" : "fail",
          statusCode: res.status,
          latencyMs,
          detail: ok ? `HTTP ${res.status} in ${latencyMs}ms` : `HTTP ${res.status}`,
          affectedObject: url,
          checkKind,
        };
      }

      case MonitorType.DNS: {
        const host = monitor.target.replace(/^https?:\/\//, "").split("/")[0]!;
        const started = Date.now();
        const records = await dns.resolve(host);
        const latencyMs = Date.now() - started;
        const ok = records.length > 0;
        return {
          status: ok ? "ok" : "fail",
          latencyMs,
          detail: ok ? `Resolved ${records.length} record(s)` : "No DNS records",
          affectedObject: host,
          checkKind,
        };
      }

      case MonitorType.SECURITY: {
        const { headers, finalUrl, res } = await fetchPage(url);
        const a = analyzeSecurity(finalUrl, headers);
        return {
          status: a.ok ? "ok" : "fail",
          statusCode: res.status,
          detail: a.issues.length ? a.issues.join("; ") : "HTTPS + security headers present",
          affectedObject: url,
          checkKind,
        };
      }

      case MonitorType.MOBILE: {
        const { html, res } = await fetchPage(url);
        const a = analyzeMobile(html);
        return {
          status: a.ok ? "ok" : "fail",
          statusCode: res.status,
          detail: a.ok ? "Responsive viewport configured" : a.issues.join("; "),
          affectedObject: url,
          checkKind,
        };
      }

      case MonitorType.INDEXING: {
        const { html, headers, res } = await fetchPage(url);
        const origin = new URL(url).origin;
        const robots = await fetch(`${origin}/robots.txt`, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8_000),
        })
          .then(async (r) => (r.ok ? await r.text() : null))
          .catch(() => null);
        const sitemapFound =
          (robots !== null && /^sitemap\s*:/im.test(robots)) ||
          (await fetch(`${origin}/sitemap.xml`, {
            headers: { "user-agent": UA },
            signal: AbortSignal.timeout(8_000),
          })
            .then((r) => r.ok)
            .catch(() => false));
        const a = analyzeIndexing({
          html,
          xRobotsTag: headers["x-robots-tag"] ?? null,
          robotsTxt: robots,
          sitemapFound,
        });
        return {
          status: a.ok ? "ok" : "fail",
          statusCode: res.status,
          detail: a.issues.length ? a.issues.join("; ") : "Indexable; sitemap found",
          affectedObject: url,
          checkKind,
        };
      }

      case MonitorType.CONTENT_CHANGE: {
        const { html, res } = await fetchPage(url);
        if (res.status >= 400) {
          return {
            status: "unknown",
            statusCode: res.status,
            detail: `Could not read page (HTTP ${res.status})`,
            affectedObject: url,
            checkKind,
          };
        }
        const hash = contentHash(html);
        const previous = (monitor.state as { contentHash?: string } | null)?.contentHash ?? null;
        const changed = previous !== null && previous !== hash;
        return {
          status: changed ? "fail" : "ok",
          statusCode: res.status,
          detail:
            previous === null
              ? "Baseline captured"
              : changed
                ? "Page content changed since the last check"
                : "No content change",
          affectedObject: url,
          checkKind,
          state: { contentHash: hash, capturedAt: new Date().toISOString() },
        };
      }

      case MonitorType.BROKEN_LINKS: {
        const { html, res, finalUrl } = await fetchPage(url);
        if (res.status >= 400) {
          return {
            status: "unknown",
            statusCode: res.status,
            detail: `Could not read page (HTTP ${res.status})`,
            affectedObject: url,
            checkKind,
          };
        }
        const links = extractLinks(html, finalUrl, 20);
        const results = await Promise.all(
          links.map(async (link) => {
            try {
              const r = await fetch(link, {
                method: "GET",
                redirect: "follow",
                headers: { "user-agent": UA },
                signal: AbortSignal.timeout(8_000),
              });
              return { link, status: r.status };
            } catch {
              return { link, status: 0 }; // network error → not counted (avoids false positives)
            }
          }),
        );
        const broken = results.filter((r) => isBrokenStatus(r.status));
        return {
          status: broken.length ? "fail" : "ok",
          statusCode: res.status,
          detail: broken.length
            ? `${broken.length} broken link(s): ${broken
                .slice(0, 3)
                .map((b) => `${b.link} (${b.status})`)
                .join(", ")}`.slice(0, 480)
            : `${links.length} link(s) checked, none broken`,
          affectedObject: url,
          checkKind,
        };
      }

      case MonitorType.PAGE_SPEED: {
        const key = process.env.PAGESPEED_API_KEY;
        const api =
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}` +
          `&strategy=mobile&category=performance${key ? `&key=${encodeURIComponent(key)}` : ""}`;
        // No API key: authenticate with the Google service account instead, which
        // gives the project's own PageSpeed quota. Neither → the shared keyless quota.
        const headers: Record<string, string> = {};
        let authed = !!key;
        if (!key) {
          const token = await getGoogleAccessToken(["openid"]);
          if (token.ok) {
            headers.authorization = `Bearer ${token.token}`;
            authed = true;
          }
        }
        const started = Date.now();
        const r = await fetch(api, { headers, signal: AbortSignal.timeout(50_000) });
        if (!r.ok) {
          return {
            status: "unknown",
            statusCode: r.status,
            detail: `PageSpeed API unavailable (HTTP ${r.status})${authed ? "" : " — connect a Google service account or set PAGESPEED_API_KEY"}`,
            affectedObject: url,
            checkKind,
          };
        }
        const report = buildPageSpeedReport(await r.json());
        if (report.score === null) {
          return { status: "unknown", detail: pageSpeedDetail(report), affectedObject: url, checkKind };
        }
        return {
          // Fails only in Google's "poor" band; the reason is always stored.
          status: report.verdict === "poor" ? "fail" : "ok",
          latencyMs: Date.now() - started,
          detail: pageSpeedDetail(report),
          affectedObject: url,
          checkKind,
          state: { pageSpeed: report, measuredAt: new Date().toISOString() },
        };
      }

      default:
        // LEAD_ROUTE / CUSTOM — driven by explicit (simulated or webhook) results.
        return {
          status: "unknown",
          detail: "Manual check — no automated probe configured",
          affectedObject: monitor.target,
          checkKind,
        };
    }
  } catch (err) {
    // A crawl that cannot finish is not proof the site is broken.
    if (monitor.kind === "SITE_CRAWL") {
      return {
        status: "unknown",
        detail: err instanceof Error ? `Crawl did not complete: ${err.name}` : "Crawl error",
        affectedObject: monitor.target,
        checkKind,
      };
    }
    // A measurement tool timing out is not a site outage.
    if (monitor.type === MonitorType.PAGE_SPEED) {
      return {
        status: "unknown",
        detail: err instanceof Error ? `PageSpeed check did not complete: ${err.name}` : "Check error",
        affectedObject: monitor.target,
        checkKind,
      };
    }
    return {
      status: "fail",
      detail: err instanceof Error ? `${err.name}: ${err.message}` : "Check error",
      affectedObject: monitor.target,
      checkKind,
    };
  }
}
