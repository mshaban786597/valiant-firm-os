import { describe, expect, it } from "vitest";
import {
  certVerdict,
  effectiveKind,
  endpointReachable,
  extractForms,
  hasContactField,
  isAdvancedKind,
  median,
  pageFacts,
  parseSitemap,
  responseVerdict,
  summarizeCrawl,
} from "@/lib/monitoring/advanced";
import { WEBSITE_SUITE, suiteDbFields } from "@/lib/monitoring/analyzers";
import { defaultSeverity } from "@/lib/monitoring/fingerprint";
import { checkState } from "@/lib/monitoring/state";

const now = new Date("2026-11-17T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("SSL certificate expiry", () => {
  it("passes with plenty of time left and states the date and issuer", () => {
    const v = certVerdict(days(37), "Let's Encrypt", now);
    expect(v).toMatchObject({ ok: true, daysLeft: 37 });
    expect(v.detail).toBe("Certificate valid for 37 more days (expires 2026-12-24); issuer Let's Encrypt");
  });
  it("fails inside the warning window and once expired", () => {
    expect(certVerdict(days(14), "X", now)).toMatchObject({ ok: false, daysLeft: 14 });
    expect(certVerdict(days(15), "X", now).ok).toBe(true);
    const expired = certVerdict(days(-3), "X", now);
    expect(expired.ok).toBe(false);
    expect(expired.detail).toContain("expired 3 day(s) ago");
  });
});

describe("response time trend", () => {
  it("computes a median", () => {
    expect(median([])).toBeNull();
    expect(median([858, 337, 536])).toBe(536);
    expect(median([100, 300])).toBe(200);
  });
  it("only applies the absolute limit until a baseline of 5 exists", () => {
    expect(responseVerdict(2500, [200, 210])).toMatchObject({ ok: true, baselineMs: null });
    expect(responseVerdict(3500, [])).toMatchObject({ ok: false });
  });
  it("flags a site that is much slower than its own usual speed", () => {
    const usual = [400, 420, 380, 410, 390];
    expect(responseVerdict(450, usual)).toMatchObject({ ok: true, baselineMs: 400 });
    const slow = responseVerdict(1500, usual);
    expect(slow.ok).toBe(false);
    expect(slow.detail).toBe("Slower than usual: 1500ms vs usual 400ms (last 5 checks)");
  });
  it("does not alarm on noise for an already fast site", () => {
    expect(responseVerdict(300, [100, 110, 90, 105, 95]).ok).toBe(true); // 3x but only +200ms
  });
});

describe("sitemap parsing", () => {
  it("reads page URLs, including CDATA and escaped ampersands", () => {
    const xml = `<urlset><url><loc>https://a.com/</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc><![CDATA[https://a.com/x?a=1&amp;b=2]]></loc></url><url><loc>https://a.com/</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual({ urls: ["https://a.com/", "https://a.com/x?a=1&b=2"], sitemaps: [] });
  });
  it("reads a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://a.com/pages.xml</loc></sitemap><sitemap><loc>https://a.com/posts.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({ urls: [], sitemaps: ["https://a.com/pages.xml", "https://a.com/posts.xml"] });
  });
});

describe("crawl summary", () => {
  const good = '<title>Home</title><link rel="canonical" href="/"><h1>Hi</h1>';
  const page = (url: string, status: number, html: string) => {
    const f = pageFacts(html);
    return { url, status, title: f.title, issues: f.issues };
  };
  it("finds on-page issues", () => {
    expect(pageFacts(good).issues).toEqual([]);
    expect(pageFacts("<p>x</p>").issues).toEqual(["missing title", "missing H1", "missing canonical"]);
    expect(pageFacts(good + '<meta name="robots" content="noindex,follow">').issues).toEqual(["noindex"]);
    expect(pageFacts(good, "noindex").issues).toEqual(["noindex"]);
  });
  it("passes a clean site and says how much was crawled", () => {
    const s = summarizeCrawl([page("https://a.com/", 200, good), page("https://a.com/b", 200, good.replace("Home", "B"))], [], 2, false);
    expect(s.ok).toBe(true);
    expect(s.detail).toBe("2 sitemap pages crawled: no broken pages or links.");
  });
  it("fails on broken pages, broken links and noindexed sitemap pages", () => {
    const s = summarizeCrawl(
      [
        page("https://a.com/", 200, good),
        page("https://a.com/gone", 404, ""),
        page("https://a.com/hidden", 200, good.replace("Home", "Hidden") + '<meta name="robots" content="noindex">'),
      ],
      [{ url: "https://a.com/old", status: 404, from: "https://a.com/" }],
      3,
      false,
    );
    expect(s.ok).toBe(false);
    expect(s.detail).toContain("1 broken page(s), 1 broken internal link(s), 1 sitemap page(s) set to noindex");
    expect(s.detail).toContain("First: https://a.com/gone (404).");
    expect(s.findings.brokenPages).toEqual([{ url: "https://a.com/gone", status: 404 }]);
  });
  it("reports missing tags and duplicate titles without failing, and marks a partial crawl", () => {
    const s = summarizeCrawl(
      [page("https://a.com/", 200, good), page("https://a.com/2", 200, good), page("https://a.com/3", 200, "<title>T</title>")],
      [],
      10,
      true,
    );
    expect(s.ok).toBe(true);
    expect(s.detail).toBe(
      "3 of 10 sitemap pages crawled (time limit reached): no broken pages or links; also 1 without an H1, 1 without a canonical, 1 duplicate title group(s).",
    );
    expect(s.findings.duplicateTitles[0]!.urls).toEqual(["https://a.com/", "https://a.com/2"]);
  });
  it("does not count an unreachable page (status 0) as broken", () => {
    expect(summarizeCrawl([{ url: "https://a.com/x", status: 0, title: null, issues: [] }], [], 1, false).ok).toBe(true);
  });
});

describe("lead form routing", () => {
  const html = `
    <form role="search" action="/search"><input name="q"></form>
    <form action="/find"><input type="text" name="s"></form>
    <form action="/api/contact.php" method="POST">
      <input type="hidden" name="token"><input name="full_name"><input type="email" name="email">
      <input type="tel" name="phone"><textarea name="message"></textarea><input type="submit" name="go">
    </form>`;
  it("finds the lead form and ignores search forms, hidden fields and buttons", () => {
    expect(extractForms(html, "https://site.com/contact/")).toEqual([
      { action: "https://site.com/api/contact.php", method: "post", fields: ["full_name", "email", "phone", "message"] },
    ]);
  });
  it("defaults the action to the page itself", () => {
    expect(extractForms('<form><input name="email"></form>', "https://site.com/c")[0]!.action).toBe("https://site.com/c");
  });
  it("knows a contact field and a reachable handler", () => {
    expect(hasContactField(["full_name", "phone"])).toBe(true);
    expect(hasContactField(["full_name", "message"])).toBe(false);
    expect(endpointReachable(405)).toBe(true); // POST-only handler answering a GET
    expect(endpointReachable(200)).toBe(true);
    expect(endpointReachable(404)).toBe(false);
    expect(endpointReachable(500)).toBe(false);
    expect(endpointReachable(0)).toBe(false);
  });
});

describe("advanced kinds in the suite", () => {
  it("stores deeper kinds as CUSTOM + kind, base checks unchanged", () => {
    const ssl = WEBSITE_SUITE.filter((s) => s.type === "SSL_EXPIRY")[0]!;
    expect(suiteDbFields(ssl)).toEqual({ type: "CUSTOM", kind: "SSL_EXPIRY" });
    const up = WEBSITE_SUITE.filter((s) => s.type === "UPTIME")[0]!;
    expect(suiteDbFields(up)).toEqual({ type: "UPTIME", kind: null });
    expect(WEBSITE_SUITE.map((s) => s.type)).toEqual(
      expect.arrayContaining(["SSL_EXPIRY", "SITE_CRAWL", "RESPONSE_TIME", "FORM"]),
    );
  });
  it("uses the kind for severity, freshness and identification", () => {
    expect(isAdvancedKind("FORM")).toBe(true);
    expect(isAdvancedKind("CUSTOM")).toBe(false);
    expect(isAdvancedKind(null)).toBe(false);
    expect(effectiveKind({ type: "CUSTOM", kind: "SITE_CRAWL" })).toBe("SITE_CRAWL");
    expect(effectiveKind({ type: "UPTIME", kind: null })).toBe("UPTIME");
    expect(defaultSeverity("SSL_EXPIRY")).toBe("CRITICAL");
    expect(defaultSeverity("FORM")).toBe("CRITICAL");
    expect(defaultSeverity("RESPONSE_TIME")).toBe("WARNING");
    // A scheduled deeper check goes stale; a plain CUSTOM (manual) check does not.
    const old = { enabled: true, lastStatus: "ok", lastCheckAt: new Date(now.getTime() - 5 * 86_400_000), cadenceMinutes: 30 };
    expect(checkState({ ...old, type: "RESPONSE_TIME" }, now)).toBe("stale");
    expect(checkState({ ...old, type: "CUSTOM" }, now)).toBe("passing");
  });
});
