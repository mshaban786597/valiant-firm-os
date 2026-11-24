import { describe, expect, it } from "vitest";
import {
  WEBSITE_SUITE,
  analyzeIndexing,
  analyzeMobile,
  analyzeSecurity,
  contentHash,
  extractLinks,
  hasNoindex,
  isBrokenStatus,
  normalizeSiteUrl,
  robotsBlocksAll,
  summarizePageSpeed,
} from "@/lib/monitoring/analyzers";
import { channelStatus, formatNotification } from "@/lib/notifications/dispatch";
import { hasLiveTest, testIntegration } from "@/lib/integrations/catalog-ping";
import {
  INTEGRATIONS,
  getIntegration,
  integrationState,
  missingEnv,
} from "@/lib/integrations/catalog";
import { buildOutreachDraft } from "@/lib/outreach/draft";
import { NAV_GROUPS, NAV_ITEMS } from "@/components/layout/nav-items";
import { can } from "@/lib/permissions";

describe("security analyzer", () => {
  const good = {
    "Strict-Transport-Security": "max-age=63072000",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  };
  it("passes with HTTPS and the core headers (case-insensitive)", () => {
    const a = analyzeSecurity("https://x.com/", good);
    expect(a.ok).toBe(true);
    expect(a.issues).toEqual([]);
  });
  it("fails on plain HTTP even with headers", () => {
    expect(analyzeSecurity("http://x.com/", good).ok).toBe(false);
  });
  it("tolerates one missing header but fails on two or more", () => {
    expect(analyzeSecurity("https://x.com", { ...good, "X-Content-Type-Options": undefined }).ok).toBe(true);
    const a = analyzeSecurity("https://x.com", {});
    expect(a.ok).toBe(false);
    expect(a.issues).toContain("Missing HSTS");
  });
});

describe("link extraction", () => {
  const html = `
    <a href="/about">About</a> <a href="/about#team">dup</a>
    <a href="https://other.com/x">ext</a>
    <a href="mailto:a@b.co">mail</a> <a href="tel:123">tel</a> <a href="javascript:void(0)">js</a>
    <a class="b" href='contact'>Contact</a>`;
  it("resolves, dedupes, skips non-http and lists internal links first", () => {
    expect(extractLinks(html, "https://site.com/page")).toEqual([
      "https://site.com/about",
      "https://site.com/contact",
      "https://other.com/x",
    ]);
  });
  it("respects the limit and bad base URLs", () => {
    expect(extractLinks(html, "https://site.com", 1)).toHaveLength(1);
    expect(extractLinks(html, "not a url")).toEqual([]);
  });
  it("only counts real breakage as broken", () => {
    expect(isBrokenStatus(404)).toBe(true);
    expect(isBrokenStatus(503)).toBe(true);
    expect(isBrokenStatus(403)).toBe(false); // bot block
    expect(isBrokenStatus(200)).toBe(false);
    expect(isBrokenStatus(0)).toBe(false); // network error is not proof
  });
});

describe("indexing analyzer", () => {
  it("detects a site-wide robots.txt block only for all crawlers", () => {
    expect(robotsBlocksAll("User-agent: *\nDisallow: /")).toBe(true);
    expect(robotsBlocksAll("User-agent: *\nDisallow: /admin")).toBe(false);
    expect(robotsBlocksAll("User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow:")).toBe(false);
  });
  it("detects noindex via meta or header", () => {
    expect(hasNoindex('<meta name="robots" content="noindex, follow">')).toBe(true);
    expect(hasNoindex('<meta name="robots" content="index, follow">')).toBe(false);
    expect(hasNoindex("<p>hi</p>", "noindex")).toBe(true);
  });
  it("fails on a blocking issue; a missing sitemap alone only warns", () => {
    const base = { html: "<p>ok</p>", robotsTxt: "User-agent: *\nDisallow:", sitemapFound: true };
    expect(analyzeIndexing(base)).toEqual({ ok: true, issues: [] });
    const noMap = analyzeIndexing({ ...base, sitemapFound: false });
    expect(noMap.ok).toBe(true);
    expect(noMap.issues).toEqual(["No sitemap.xml found"]);
    expect(analyzeIndexing({ ...base, robotsTxt: "User-agent: *\nDisallow: /" }).ok).toBe(false);
  });
});

describe("mobile + content + page speed analyzers", () => {
  it("requires a device-width viewport", () => {
    expect(analyzeMobile('<meta name="viewport" content="width=device-width, initial-scale=1">').ok).toBe(true);
    expect(analyzeMobile('<meta name="viewport" content="width=1024">').ok).toBe(false);
    expect(analyzeMobile("<html></html>").issues).toEqual(["No viewport meta tag"]);
  });
  it("hashes visible text only (markup, scripts and whitespace ignored)", () => {
    const a = contentHash("<h1>Hello</h1><script>var t=1</script><p>World</p>");
    const b = contentHash("<div><h1>Hello</h1>\n\n<script>var t=2</script><p>  World </p></div>");
    expect(a).toBe(b);
    expect(contentHash("<h1>Hello</h1><p>Changed</p>")).not.toBe(a);
  });
  it("summarizes a PageSpeed response and applies the threshold", () => {
    const psi = {
      lighthouseResult: {
        categories: { performance: { score: 0.42 } },
        audits: {
          "largest-contentful-paint": { numericValue: 4321 },
          "cumulative-layout-shift": { numericValue: 0.1234 },
        },
      },
    };
    const s = summarizePageSpeed(psi);
    expect(s).toMatchObject({ score: 42, lcpMs: 4321, cls: 0.123, ok: false });
    expect(s.detail).toBe("Performance 42/100 · LCP 4.3s · CLS 0.123");
    expect(summarizePageSpeed({ lighthouseResult: { categories: { performance: { score: 0.9 } } } }).ok).toBe(true);
    // No score → not treated as a site failure.
    expect(summarizePageSpeed({}).ok).toBe(true);
  });
});

describe("website suite", () => {
  it("normalizes site URLs", () => {
    expect(normalizeSiteUrl("example.com")).toBe("https://example.com");
    expect(normalizeSiteUrl(" http://Example.com/ ")).toBe("http://example.com");
    expect(normalizeSiteUrl("https://a.com/contact")).toBe("https://a.com/contact");
    expect(normalizeSiteUrl("localhost")).toBeNull();
    expect(normalizeSiteUrl("")).toBeNull();
  });
  it("covers every diagram check exactly once", () => {
    const types = WEBSITE_SUITE.map((s) => s.type);
    expect(types.length).toBe(13);
    expect(types.filter((t, i) => types.indexOf(t) !== i)).toEqual([]);
    expect(WEBSITE_SUITE.find((s) => s.type === "UPTIME")?.cadenceMinutes).toBe(15);
  });
});

describe("notifications", () => {
  it("reports a channel as configured only when all its env vars are set", () => {
    expect(channelStatus({})).toEqual({ email: false, slack: false, telegram: false });
    expect(channelStatus({ RESEND_API_KEY: "k" }).email).toBe(false);
    expect(
      channelStatus({
        RESEND_API_KEY: "k",
        ALERT_EMAIL_TO: "a@b.co",
        SLACK_WEBHOOK_URL: "https://hooks.slack.test/x",
        TELEGRAM_BOT_TOKEN: "t",
      }),
    ).toEqual({ email: true, slack: true, telegram: false });
  });
  it("formats a subject with severity and a deep link", () => {
    const m = formatNotification(
      { event: "incident_opened", title: "site.com — HTTP 500", body: "Site: site.com", severity: "critical", path: "/monitoring" },
      "https://app.test/",
    );
    expect(m.subject).toBe("Website issue [CRITICAL]: site.com — HTTP 500");
    expect(m.text).toContain("Site: site.com");
    expect(m.text).toContain("https://app.test/monitoring");
  });
});

describe("integration catalog", () => {
  it("has unique ids and covers the diagram's tool groups", () => {
    const ids = INTEGRATIONS.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    ["gsc", "ga4", "google-ads", "ubersuggest", "meta-ads", "tiktok-ads", "mailchimp", "slack", "telegram"].forEach(
      (id) => expect(getIntegration(id)).not.toBeNull(),
    );
  });
  it("derives status from env only", () => {
    const mailchimp = getIntegration("mailchimp")!;
    expect(integrationState(mailchimp, {})).toBe("not_connected");
    expect(integrationState(mailchimp, { MAILCHIMP_API_KEY: "  " })).toBe("not_connected");
    expect(integrationState(mailchimp, { MAILCHIMP_API_KEY: "k" })).toBe("connected");
    // Tools we do not use are not listed at all.
    ["ahrefs", "semrush", "moz", "surfer", "clearscope", "marketmuse", "frase", "linkedin-ads", "gtm", "openai"].forEach((id) =>
      expect(getIntegration(id)).toBeNull(),
    );
    expect(hasLiveTest("linkedin-ads")).toBe(false);
    expect(hasLiveTest("openai")).toBe(false);
    expect(getIntegration("anthropic")).not.toBeNull();
    expect(INTEGRATIONS.some((tool) => (tool.category as string) === "Content & Semantic SEO")).toBe(false);
    // Ubersuggest is connected by signing in, so env alone never connects it (see ubersuggest.test.ts).
    expect(integrationState(getIntegration("ubersuggest")!, {})).toBe("not_connected");
    expect(missingEnv(getIntegration("ga4")!, { GA4_PROPERTY_ID: "1" })).toEqual(["GOOGLE_SERVICE_ACCOUNT_JSON"]);
    expect(integrationState(getIntegration("site-monitor")!, {})).toBe("connected");
    // PageSpeed works with either the service account or its own API key.
    const psi = getIntegration("pagespeed")!;
    expect(integrationState(psi, {})).toBe("not_connected");
    expect(missingEnv(psi, {})).toEqual(["GOOGLE_SERVICE_ACCOUNT_JSON or PAGESPEED_API_KEY"]);
    expect(integrationState(psi, { GOOGLE_SERVICE_ACCOUNT_JSON: "{}" })).toBe("connected");
    expect(integrationState(psi, { PAGESPEED_API_KEY: "k" })).toBe("connected");
  });
  it("never calls a provider when credentials are missing", async () => {
    expect(hasLiveTest("stripe")).toBe(true);
    expect(hasLiveTest("ubersuggest")).toBe(false);
    const r = await testIntegration(getIntegration("stripe")!, {});
    expect(r).toEqual({ ok: false, detail: "Missing: STRIPE_SECRET_KEY" });
  });
});

describe("outreach draft", () => {
  it("uses only the lead's stored fields", () => {
    const d = buildOutreachDraft({
      businessName: "Acme Gutters",
      niche: "Gutters",
      city: "Panama City",
      state: "FL",
      websiteStatus: "No gutter repair page",
      gbpStatus: null,
      outreachAngle: null,
      recommendedOffer: "Local SEO + GBP",
    });
    expect(d.subject).toBe("Quick idea for Acme Gutters in Panama City, FL");
    expect(d.body).toContain("- Website: No gutter repair page");
    expect(d.body).not.toContain("Google Business Profile");
    expect(d.body).toContain("What I would suggest: Local SEO + GBP.");
  });
  it("works with a bare lead", () => {
    const d = buildOutreachDraft({ businessName: "Bare Co" });
    expect(d.subject).toBe("Quick idea for Bare Co");
    expect(d.body).not.toContain("What I noticed");
  });
});

describe("workspace navigation + approval permissions", () => {
  it("groups nav into the two workspaces with no duplicate routes", () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(["Command", "Client Operations", "Sales & Outreach", "System"]);
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
    ["/automation-system", "/approvals", "/integrations", "/monitoring", "/leads"].forEach((h) =>
      expect(hrefs).toContain(h),
    );
  });
  it("lets sales request but not decide approvals", () => {
    expect(can("SALES", "approval.request")).toBe(true);
    expect(can("SALES", "approval.decide")).toBe(false);
    expect(can("FOUNDER", "approval.decide")).toBe(true);
    expect(can("VIEWER", "approval.request")).toBe(false);
    expect(can("VIEWER", "approval.read")).toBe(true);
  });
});
