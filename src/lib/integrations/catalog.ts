/**
 * Data only: this file is bundled into pages, so it holds no network code.
 * Connection tests live in catalog-ping.ts (server routes only).
 *
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
  | "Digital Marketing"
  | "AI"
  | "Notifications"
  | "Ecommerce"
  | "Sales & Billing"
  | "Monitoring";

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
  /** Connected by signing in (state is stored in the database, not in env). */
  oauth?: boolean;
  data: "live" | "sample" | "planned" | "imported";
}

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
    id: "google-ads",
    name: "Google Ads",
    category: "Google Tools",
    powers: "Campaigns, spend, clicks and conversions (read only)",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    data: "live",
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
    oauth: true,
    data: "live",
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
  // ---- Digital marketing -------------------------------------------------
  {
    id: "meta-ads",
    name: "Meta Ads",
    category: "Digital Marketing",
    powers: "Facebook & Instagram ad performance",
    envVars: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    data: "planned",
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
  },
  // ---- AI ----------------------------------------------------------------
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    category: "AI",
    powers: "Lead scoring, report summaries, content analysis",
    envVars: ["ANTHROPIC_API_KEY"],
    data: "live",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI",
    powers: "Primary model for AI scoring & summaries",
    envVars: ["OPENAI_API_KEY"],
    data: "live",
  },
  // ---- Notifications -----------------------------------------------------
  {
    id: "email-alerts",
    name: "Email alerts (Resend)",
    category: "Notifications",
    powers: "Incident, lead and approval alerts by email; approved outreach sending",
    envVars: ["RESEND_API_KEY", "ALERT_EMAIL_TO"],
    data: "live",
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
  },
  // ---- Ecommerce ---------------------------------------------------------
  {
    id: "shopify",
    name: "Shopify",
    category: "Ecommerce",
    powers: "Products, orders, revenue",
    envVars: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_TOKEN"],
    data: "sample",
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
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Sales & Billing",
    powers: "Payments → invoices",
    envVars: ["STRIPE_SECRET_KEY"],
    data: "planned",
  },
];

export type IntegrationState = "connected" | "not_connected";

const isSet = (env: Env, k: string) => !!env[k] && env[k]!.trim() !== "";

export function integrationState(tool: ToolIntegration, env: Env = process.env, signedIn: string[] = []): IntegrationState {
  // A sign-in tool is connected only when its sign-in is on record.
  if (tool.oauth) return signedIn.indexOf(tool.id) !== -1 ? "connected" : "not_connected";
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
