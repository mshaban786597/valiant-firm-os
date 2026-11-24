import { missingEnv, type ToolIntegration } from "@/lib/integrations/catalog";
import { resolveModel } from "@/lib/ai/claude";

/**
 * Live connection tests for the tools in the catalog. Server routes only:
 * these build requests to third-party APIs with the configured credentials,
 * so they must never be bundled into a page.
 */
type Env = Record<string, string | undefined>;

export interface PingRequest {
  url: string;
  headers?: Record<string, string>;
}

const bearer = (token: string | undefined) => ({ authorization: `Bearer ${token}` });

/** A cheap, read-only request per tool that proves its credentials work. */
export const PINGS: Record<string, (e: Env) => PingRequest> = {
  "meta-ads": (e) => ({
    url: "https://graph.facebook.com/v19.0/me?fields=id",
    headers: bearer(e.META_ACCESS_TOKEN),
  }),
  mailchimp: (e) => {
    const key = e.MAILCHIMP_API_KEY ?? "";
    const dc = key.split("-")[1] ?? "us1";
    return { url: `https://${dc}.api.mailchimp.com/3.0/ping`, headers: bearer(key) };
  },
  anthropic: (e) => ({
    url: `https://api.anthropic.com/v1/models/${encodeURIComponent(resolveModel(e.ANTHROPIC_MODEL))}`,
    headers: { "x-api-key": e.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
  }),
  "email-alerts": (e) => ({ url: "https://api.resend.com/domains", headers: bearer(e.RESEND_API_KEY) }),
  telegram: (e) => ({ url: `https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/getMe` }),
  shopify: (e) => ({
    url: `https://${e.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/shop.json`,
    headers: { "x-shopify-access-token": e.SHOPIFY_ADMIN_TOKEN ?? "" },
  }),
  calendly: (e) => ({ url: "https://api.calendly.com/users/me", headers: bearer(e.CALENDLY_API_TOKEN) }),
  stripe: (e) => ({ url: "https://api.stripe.com/v1/balance", headers: bearer(e.STRIPE_SECRET_KEY) }),
};

export function hasLiveTest(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PINGS, id);
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
  const ping = PINGS[tool.id];
  if (!ping) {
    return {
      ok: true,
      detail: tool.envVars.length
        ? "Credentials are set (no live test available for this tool yet)"
        : "Built in — no credentials needed",
    };
  }
  try {
    const req = ping(env);
    const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(10_000) });
    return res.ok
      ? { ok: true, detail: `Connection verified (HTTP ${res.status})` }
      : { ok: false, detail: `Provider rejected the credentials (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? `Could not reach provider: ${err.name}` : "Could not reach provider" };
  }
}
