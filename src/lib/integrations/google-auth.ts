import crypto from "node:crypto";

/**
 * Google service-account auth (server-to-server, read-only scopes).
 * The key is read from GOOGLE_SERVICE_ACCOUNT_JSON and never logged or returned.
 */
type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text) as Partial<ServiceAccount>;
    if (!json.client_email || !json.private_key) return null;
    return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Build the signed JWT assertion (exported for tests). */
export function buildAssertion(sa: ServiceAccount, scopes: string[], nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key);
  return `${header}.${claims}.${b64url(signature)}`;
}

export type TokenResult =
  | { ok: true; token: string; account: string }
  | { ok: false; kind: "not_configured" | "invalid_credentials" | "needs_reauth" | "error"; detail: string };

const cache: Record<string, { token: string; exp: number }> = {};

export async function getGoogleAccessToken(
  scopes: string[],
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<TokenResult> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { ok: false, kind: "not_configured", detail: "GOOGLE_SERVICE_ACCOUNT_JSON is not set" };
  }
  const sa = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!sa) {
    return { ok: false, kind: "invalid_credentials", detail: "GOOGLE_SERVICE_ACCOUNT_JSON is not a valid service-account key" };
  }
  const key = `${sa.client_email}|${scopes.join(" ")}`;
  const now = Math.floor(Date.now() / 1000);
  const hit = cache[key];
  if (hit && hit.exp - 60 > now) return { ok: true, token: hit.token, account: sa.client_email };

  let assertion: string;
  try {
    assertion = buildAssertion(sa, scopes, now);
  } catch {
    return { ok: false, kind: "invalid_credentials", detail: "The service-account private key could not be used to sign" };
  }
  try {
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 400 || res.status === 401) {
      return { ok: false, kind: "needs_reauth", detail: `Google rejected the service-account key (HTTP ${res.status})` };
    }
    if (!res.ok) return { ok: false, kind: "error", detail: `Google token endpoint returned HTTP ${res.status}` };
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return { ok: false, kind: "error", detail: "Google returned no access token" };
    cache[key] = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
    return { ok: true, token: json.access_token, account: sa.client_email };
  } catch {
    return { ok: false, kind: "error", detail: "Could not reach Google's token endpoint" };
  }
}
