import crypto from "node:crypto";

/**
 * OAuth 2.1 for a remote MCP server: public client, PKCE (S256), dynamic
 * client registration, refresh tokens. Server only.
 */
type FetchLike = typeof fetch;

export interface McpAuthServer {
  /** The MCP endpoint itself (also the OAuth "resource"). */
  resource: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint?: string;
  scopes: string[];
}

export const UBERSUGGEST_MCP: McpAuthServer = {
  resource: "https://ubersuggest-mcp.neilpatelapi.com/mcp",
  authorizationEndpoint: "https://ubersuggest-mcp.neilpatelapi.com/authorize",
  tokenEndpoint: "https://ubersuggest-mcp.neilpatelapi.com/token",
  registrationEndpoint: "https://ubersuggest-mcp.neilpatelapi.com/register",
  revocationEndpoint: "https://ubersuggest-mcp.neilpatelapi.com/revoke",
  scopes: ["profile", "domain", "keywords", "serp", "backlinks", "site_audit", "projects", "utility"],
};

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  return { verifier, challenge: crypto.createHash("sha256").update(verifier).digest("base64url") };
}

export function newState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export type OAuthResult<T> = { ok: true; data: T } | { ok: false; detail: string; status?: number };

async function postJson<T>(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<OAuthResult<T>> {
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    if (!res.ok) {
      let reason = "";
      try {
        const j = JSON.parse(text) as { error?: string; error_description?: string };
        reason = [j.error, j.error_description].filter(Boolean).join(": ");
      } catch {
        /* not JSON */
      }
      return { ok: false, status: res.status, detail: `HTTP ${res.status}${reason ? ` (${reason.slice(0, 160)})` : ""}` };
    }
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, detail: "No response from the provider" };
  }
}

/** Register this app as a client of the MCP server (once per redirect address). */
export async function registerClient(
  server: McpAuthServer,
  redirectUri: string,
  fetchImpl: FetchLike = fetch,
): Promise<OAuthResult<{ clientId: string }>> {
  const r = await postJson<{ client_id?: string }>(fetchImpl, server.registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Valiant Firm Agency OS",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!r.ok) return r;
  return r.data.client_id ? { ok: true, data: { clientId: r.data.client_id } } : { ok: false, detail: "The provider did not return a client id" };
}

export function authorizeUrl(server: McpAuthServer, p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    scope: server.scopes.join(" "),
    resource: server.resource,
  });
  return `${server.authorizationEndpoint}?${q.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

type RawToken = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };

export function toTokenSet(raw: RawToken, now: Date = new Date()): TokenSet | null {
  if (!raw.access_token) return null;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: typeof raw.expires_in === "number" && raw.expires_in > 0 ? new Date(now.getTime() + raw.expires_in * 1000) : null,
    scope: raw.scope ?? null,
  };
}

async function tokenRequest(server: McpAuthServer, params: Record<string, string>, fetchImpl: FetchLike): Promise<OAuthResult<TokenSet>> {
  const r = await postJson<RawToken>(fetchImpl, server.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, resource: server.resource }).toString(),
  });
  if (!r.ok) return r;
  const set = toTokenSet(r.data);
  return set ? { ok: true, data: set } : { ok: false, detail: "The provider did not return an access token" };
}

export function exchangeCode(
  server: McpAuthServer,
  p: { clientId: string; redirectUri: string; code: string; verifier: string },
  fetchImpl: FetchLike = fetch,
): Promise<OAuthResult<TokenSet>> {
  return tokenRequest(server, { grant_type: "authorization_code", client_id: p.clientId, redirect_uri: p.redirectUri, code: p.code, code_verifier: p.verifier }, fetchImpl);
}

export function refreshTokens(
  server: McpAuthServer,
  p: { clientId: string; refreshToken: string },
  fetchImpl: FetchLike = fetch,
): Promise<OAuthResult<TokenSet>> {
  return tokenRequest(server, { grant_type: "refresh_token", client_id: p.clientId, refresh_token: p.refreshToken }, fetchImpl);
}

/** True when the token is missing an expiry we can trust or is inside the last two minutes. */
export function needsRefresh(expiresAt: Date | null, now: Date = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() - now.getTime() < 120_000;
}
