/**
 * Tool Integration Layer catalog — every tool on the VF automation diagram.
 *
 * Status is derived from the server environment only (never fabricated):
 *  - "connected"      all required env vars are set (or the tool needs none)
 *  - "not_connected"  one or more required env vars are missing
 *
 * `data` says where that module's numbers come from today:
 *  - "live"     real API calls when connected
 *  - "sample"   module exists but shows no numbers until its live sync is
 *               wired (nothing is generated)
 *  - "planned"  credential slot + connection test only; no module yet
 *  - "imported" no API key: data is pulled through the tool's connector in
 *               Claude and stored as dated snapshots (the app cannot call it)
 */

export type IntegrationCategory =
  | "Google Tools"
  | "SEO & Keyword Tools"
  | "Content & Semantic SEO"
  | "Digital Marketing"
  | "AI"
  | "Notifications"
  | "Ecommerce"
  | "Sales & Billing"
  | "Monitoring";

export interface PingRequest {
  url: string;
  headers?: Record<string, string>;
}

type Env = Record<string, string | undefined>;

export interface ToolIntegration {
  id: string;
  name: string;
  category: IntegrationCategory;
  powers: string;
  /** All of these must be set. */
  envVars: string[];
  /** Alternatively, any ONE of these is enough (used when two credentials both work). */
  envAny?: string[];
  data: "live" | "sample" | "planned" | "imported";
  /** Builds a cheap, read-only request that proves the credentials work. */
  ping?: (env: Env) => PingRequest;
}

const bearer = (token: string | undefined) => ({ authorization: `Bearer ${token}` });

export const INTEGRATIONS: ToolIntegration[] = [
  // ---- Monitoring (built in, live) --------------------------------------
  {
    id: "site-monitor",
    name: "Website Monitor",
    category: "Monitoring",
    powers: "Uptime, DNS, HTTPS, broken links, security headers, indexing, mobile, content changes",
    envVars: [],
    data: "live",
  },
  {
    id: "pagespeed",
    name: "PageSpeed Insights",
    category: "Google Tools",
    powers: "Page speed & Core Web Vitals checks, using the Google service account or a PageSpeed API key",
    envVars: [],
    envAny: ["GOOGLE_SERVICE_ACCOUNT_JSON", "PAGESPEED_API_KEY"],
    data: "live",
  },
  // ---- Google ------------------------------------------------------------
  {
    id: "gsc",
    name: "Google Search Console",
    category: "Google Tools",
    powers: "Clicks, impressions, queries, indexing",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    data: "live",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "Google Tools",
    powers: "Traffic, conversions, sources",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    data: "live",
  },
  {
    id: "gtm",
    name: "Google Tag Manager",
    category: "Google Tools",
    powers: "Tag & tracking audits",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON", "GTM_ACCOUNT_ID"],
    data: "planned",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    category: "Google Tools",
    powers: "Campaigns, spend, conversions",
    envVars: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_REFRESH_TOKEN"],
    data: "sample",
  },
  {
    id: "gbp",
    name: "Google Business Profile",
    category: "Google Tools",
    powers: "Profile views, calls, website clicks, directions, reviews",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    data: "live",
  },
  // ---- SEO & keyword -----------------------------------------------------
  {
    id: "ubersuggest",
    name: "Ubersuggest",
    category: "SEO & Keyword Tools",
    powers: "Keywords, traffic estimates, backlinks, search results",
    envVars: [],
    data: "imported",
  },
  {
    id: "alsoasked",
    name: "AlsoAsked",
    category: "SEO & Keyword Tools",
    powers: "People-also-ask question research",
    envVars: ["ALSOASKED_API_KEY"],
    data: "planned",
  },
  {
    id: "answerthepublic",
    name: "AnswerThePublic",
    category: "SEO & Keyword Tools",
    powers: "Search question research",
    envVars: ["ANSWERTHEPUBLIC_API_KEY"],
    data: "planned",
  },
  // ---- Content -----------------------------------------------------------
  {
    id: "surfer",
    name: "Surfer",
    category: "Content & Semantic SEO",
    powers: "Content scoring, topical maps",
    envVars: ["SURFER_API_KEY"],
    data: "planned",
  },
  {
    id: "clearscope",
    name: "Clearscope",
    category: "Content & Semantic SEO",
    powers: "AI content briefs",
    envVars: ["CLEARSCOPE_API_KEY"],
    data: "planned",
  },
  {
    id: "marketmuse",
    name: "MarketMuse",
    category: "Content & Semantic SEO",
    powers: "Semantic content analysis",
    envVars: ["MARKETMUSE_API_KEY"],
    data: "planned",
  },
  {
    id: "frase",
    name: "Frase",
    category: "Content & Semantic SEO",
    powers: "Content optimization",
    envVars: ["FRASE_API_KEY"],
    data: "planned",
  },
  // ---- Digital marketing -------------------------------------------------
  {
    id: "meta-ads",
    name: "Meta Ads",
    category: "Digital Marketing",
    powers: "Facebook & Instagram ad performance",
    envVars: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    data: "planned",
    ping: (e) => ({
      url: "https://graph.facebook.com/v19.0/me?fields=id",
      headers: bearer(e.META_ACCESS_TOKEN),
    }),
  },
  {
    id: "linkedin-ads",
    name: "LinkedIn Ads",
    category: "Digital Marketing",
    powers: "LinkedIn campaign performance",
    envVars: ["LINKEDIN_ACCESS_TOKEN"],
    data: "planned",
    ping: (e) => ({ url: "https://api.linkedin.com/v2/userinfo", headers: bearer(e.LINKEDIN_ACCESS_TOKEN) }),
  },
  {
    id: "tiktok-ads",
    name: "TikTok Ads",
    category: "Digital Marketing",
    powers: "TikTok ad tracking",
    envVars: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID"],
    data: "planned",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "Digital Marketing",
    powers: "Email lists & CRM leads",
    envVars: ["MAILCHIMP_API_KEY"],
    data: "planned",
    ping: (e) => {
      const key = e.MAILCHIMP_API_KEY ?? "";
      const dc = key.split("-")[1] ?? "us1";
      return { url: `https://${dc}.api.mailchimp.com/3.0/ping`, headers: bearer(key) };
    },
  },
  // ---- AI ----------------------------------------------------------------
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    category: "AI",
    powers: "Lead scoring, report summaries, content analysis",
    envVars: ["ANTHROPIC_API_KEY"],
    data: "live",
    ping: (e) => ({
      url: "https://api.anthropic.com/v1/models?limit=1",
      headers: { "x-api-key": e.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    }),
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI",
    powers: "Primary model for AI scoring & summaries",
    envVars: ["OPENAI_API_KEY"],
    data: "live",
    ping: (e) => ({ url: "https://api.openai.com/v1/models", headers: bearer(e.OPENAI_API_KEY) }),
  },
  // ---- Notifications -----------------------------------------------------
  {
    id: "email-alerts",
    name: "Email alerts (Resend)",
    category: "Notifications",
    powers: "Incident, lead and approval alerts by email; approved outreach sending",
    envVars: ["RESEND_API_KEY", "ALERT_EMAIL_TO"],
    data: "live",
    ping: (e) => ({ url: "https://api.resend.com/domains", headers: bearer(e.RESEND_API_KEY) }),
  },
  {
    id: "slack",
    name: "Slack",
    category: "Notifications",
    powers: "Alerts posted to a Slack channel",
    envVars: ["SLACK_WEBHOOK_URL"],
    data: "live",
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "Notifications",
    powers: "Alerts sent by a Telegram bot",
    envVars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    data: "live",
    ping: (e) => ({ url: `https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/getMe` }),
  },
  // ---- Ecommerce ---------------------------------------------------------
  {
    id: "shopify",
    name: "Shopify",
    category: "Ecommerce",
    powers: "Products, orders, revenue",
    envVars: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_TOKEN"],
    data: "sample",
    ping: (e) => ({
      url: `https://${e.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/shop.json`,
      headers: { "x-shopify-access-token": e.SHOPIFY_ADMIN_TOKEN ?? "" },
    }),
  },
  {
    id: "amazon",
    name: "Amazon Seller",
    category: "Ecommerce",
    powers: "Listings, orders",
    envVars: ["AMAZON_SP_REFRESH_TOKEN", "AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET"],
    data: "sample",
  },
  {
    id: "ebay",
    name: "eBay",
    category: "Ecommerce",
    powers: "Listings, orders",
    envVars: ["EBAY_OAUTH_TOKEN"],
    data: "sample",
  },
  {
    id: "etsy",
    name: "Etsy",
    category: "Ecommerce",
    powers: "Listings, orders",
    envVars: ["ETSY_API_KEY", "ETSY_ACCESS_TOKEN"],
    data: "sample",
  },
  // ---- Sales & billing ---------------------------------------------------
  {
    id: "calendly",
    name: "Calendly",
    category: "Sales & Billing",
    powers: "Booked calls → pipeline",
    envVars: ["CALENDLY_API_TOKEN"],
    data: "planned",
    ping: (e) => ({ url: "https://api.calendly.com/users/me", headers: bearer(e.CALENDLY_API_TOKEN) }),
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Sales & Billing",
    powers: "Payments → invoices",
    envVars: ["STRIPE_SECRET_KEY"],
    data: "planned",
    ping: (e) => ({ url: "https://api.stripe.com/v1/balance", headers: bearer(e.STRIPE_SECRET_KEY) }),
  },
];

export type IntegrationState = "connected" | "not_connected";

const isSet = (env: Env, k: string) => !!env[k] && env[k]!.trim() !== "";

export function integrationState(tool: ToolIntegration, env: Env = process.env): IntegrationState {
  const all = tool.envVars.every((k) => isSet(env, k));
  const any = !tool.envAny || tool.envAny.some((k) => isSet(env, k));
  return all && any ? "connected" : "not_connected";
}

export function missingEnv(tool: ToolIntegration, env: Env = process.env): string[] {
  const missing = tool.envVars.filter((k) => !isSet(env, k));
  if (tool.envAny && !tool.envAny.some((k) => isSet(env, k))) missing.push(tool.envAny.join(" or "));
  return missing;
}

export function getIntegration(id: string): ToolIntegration | null {
  for (let i = 0; i < INTEGRATIONS.length; i++) {
    if (INTEGRATIONS[i]!.id === id) return INTEGRATIONS[i]!;
  }
  return null;
}

export interface TestResult {
  ok: boolean;
  detail: string;
}

/** Live credential check. Read-only; never returns secret values. */
export async function testIntegration(tool: ToolIntegration, env: Env = process.env): Promise<TestResult> {
  const missing = missingEnv(tool, env);
  if (missing.length) return { ok: false, detail: `Missing: ${missing.join(", ")}` };
  if (tool.data === "imported") {
    return { ok: true, detail: "No key needed. Data is imported through the connector in Claude and stored as dated snapshots; the app does not call this tool itself." };
  }
  if (!tool.ping) {
    return {
      ok: true,
      detail: tool.envVars.length
        ? "Credentials are set (no live test available for this tool yet)"
        : "Built in — no credentials needed",
    };
  }
  try {
    const req = tool.ping(env);
    const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(10_000) });
    return res.ok
      ? { ok: true, detail: `Connection verified (HTTP ${res.status})` }
      : { ok: false, detail: `Provider rejected the credentials (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? `Could not reach provider: ${err.name}` : "Could not reach provider" };
  }
}
