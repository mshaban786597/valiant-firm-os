import crypto from "node:crypto";

/**
 * Webhook provider registry. Each provider declares which env var holds its
 * signing secret and how to verify an inbound request's signature. The dynamic
 * route /api/webhooks/[provider] consults this map so adding a provider is a
 * one-entry change with no new route file.
 */

export interface WebhookProvider {
  id: string;
  label: string;
  /** Env var holding this provider's signing secret. */
  secretEnv: string;
  /** Verify a raw body + headers against the secret. */
  verify: (rawBody: string, headers: Headers, secret: string) => boolean;
}

function timingSafeHexEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Generic `x-webhook-signature: sha256=<hex>` over the raw body. */
function verifyGenericHmac(rawBody: string, headers: Headers, secret: string): boolean {
  const header = headers.get("x-webhook-signature");
  if (!header) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeHexEqual(expected, header.replace(/^sha256=/i, "").trim());
}

/** Stripe-style `Stripe-Signature: t=<ts>,v1=<hex>` over `${t}.${body}`. */
function verifyStripe(rawBody: string, headers: Headers, secret: string): boolean {
  const sig = headers.get("stripe-signature");
  if (!sig) return false;
  const parts = Object.fromEntries(
    sig.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return timingSafeHexEqual(expected, v1);
}

/** Typeform-style `Typeform-Signature: sha256=<base64>` over the raw body. */
function verifyTypeform(rawBody: string, headers: Headers, secret: string): boolean {
  const header = headers.get("typeform-signature");
  if (!header) return false;
  const provided = header.replace(/^sha256=/i, "").trim();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  // base64 compare (constant-ish); lengths equal for same algo.
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const WEBHOOK_PROVIDERS: Record<string, WebhookProvider> = {
  gsc: { id: "gsc", label: "Search Console", secretEnv: "WEBHOOK_SECRET_GSC", verify: verifyGenericHmac },
  ga4: { id: "ga4", label: "Google Analytics 4", secretEnv: "WEBHOOK_SECRET_GA4", verify: verifyGenericHmac },
  gbp: { id: "gbp", label: "Google Business Profile", secretEnv: "WEBHOOK_SECRET_GBP", verify: verifyGenericHmac },
  stripe: { id: "stripe", label: "Stripe", secretEnv: "STRIPE_WEBHOOK_SECRET", verify: verifyStripe },
  calendly: { id: "calendly", label: "Calendly", secretEnv: "CALENDLY_WEBHOOK_SECRET", verify: verifyGenericHmac },
  typeform: { id: "typeform", label: "Typeform", secretEnv: "TYPEFORM_WEBHOOK_SECRET", verify: verifyTypeform },
};

export function getProvider(id: string): WebhookProvider | null {
  return WEBHOOK_PROVIDERS[id] ?? null;
}

export interface VerificationResult {
  ok: boolean;
  /** True when a secret was configured and used to verify. */
  verified: boolean;
  reason?: string;
}

/**
 * Verify an inbound webhook. FAIL-CLOSED: when no secret is configured for the
 * provider the request is REJECTED, unless the explicit dev escape hatch
 * `ALLOW_UNVERIFIED_WEBHOOKS=true` is set (then accepted, flagged unverified).
 * When a secret IS set, the signature must match.
 */
export function verifyWebhook(
  provider: WebhookProvider,
  rawBody: string,
  headers: Headers,
): VerificationResult {
  const secret = process.env[provider.secretEnv];
  if (!secret) {
    if (process.env.ALLOW_UNVERIFIED_WEBHOOKS === "true") {
      return { ok: true, verified: false, reason: "no secret configured (dev override)" };
    }
    return { ok: false, verified: false, reason: "no secret configured (rejected)" };
  }
  const ok = provider.verify(rawBody, headers, secret);
  return ok
    ? { ok: true, verified: true }
    : { ok: false, verified: true, reason: "signature mismatch" };
}
