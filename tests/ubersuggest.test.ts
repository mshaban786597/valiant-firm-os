import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, seal } from "@/lib/crypto/seal";
import {
  UBERSUGGEST_MCP,
  authorizeUrl,
  exchangeCode,
  needsRefresh,
  pkcePair,
  refreshTokens,
  registerClient,
  toTokenSet,
} from "@/lib/integrations/mcp-oauth";
import { McpSession, parseRpcReply, parseToolResult } from "@/lib/integrations/mcp-client";
import { normalizeKeywords, normalizeOverview, serpQuery, serpToResults } from "@/lib/integrations/ubersuggest";
import { getIntegration, integrationState } from "@/lib/integrations/catalog";

const env = { NEXTAUTH_SECRET: "test-secret-that-is-long-enough" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("token storage", () => {
  it("encrypts and decrypts, and never stores the token in the clear", () => {
    const sealed = seal("secret-access-token", env);
    expect(sealed).not.toContain("secret-access-token");
    expect(open(sealed, env)).toBe("secret-access-token");
    expect(seal("secret-access-token", env)).not.toBe(sealed);
  });

  it("returns nothing for a tampered value, a different app secret, or no value", () => {
    const sealed = seal("tok", env);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(open(parts.join("."), env)).toBeNull();
    expect(open(sealed, { NEXTAUTH_SECRET: "another-secret-that-is-long-enough" })).toBeNull();
    expect(open(null, env)).toBeNull();
    expect(open("garbage", env)).toBeNull();
    expect(() => seal("x", {})).toThrow();
  });
});

describe("MCP sign-in (OAuth with PKCE)", () => {
  it("makes a verifier and its S256 challenge", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(crypto.createHash("sha256").update(verifier).digest("base64url"));
    expect(pkcePair().verifier).not.toBe(verifier);
  });

  it("builds the approval address with PKCE, state and the resource", () => {
    const url = new URL(authorizeUrl(UBERSUGGEST_MCP, { clientId: "c1", redirectUri: "https://app.example/cb", state: "s1", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://ubersuggest-mcp.neilpatelapi.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/cb");
    expect(url.searchParams.get("resource")).toBe("https://ubersuggest-mcp.neilpatelapi.com/mcp");
    expect(url.searchParams.get("scope")).toContain("serp");
  });

  it("registers as a public client and exchanges the code without a client secret", async () => {
    const seen: { url: string; body: string }[] = [];
    const ok: typeof fetch = async (url, init) => {
      seen.push({ url: String(url), body: String(init?.body) });
      if (String(url).endsWith("/register")) return json({ client_id: "client-123" }, 201);
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "serp" });
    };
    const reg = await registerClient(UBERSUGGEST_MCP, "https://app.example/cb", ok);
    expect(reg.ok && reg.data.clientId).toBe("client-123");
    expect(JSON.parse(seen[0]!.body)).toMatchObject({ token_endpoint_auth_method: "none", redirect_uris: ["https://app.example/cb"] });

    const tok = await exchangeCode(UBERSUGGEST_MCP, { clientId: "client-123", redirectUri: "https://app.example/cb", code: "abc", verifier: "ver" }, ok);
    expect(tok.ok && tok.data.accessToken).toBe("at");
    const form = new URLSearchParams(seen[1]!.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code_verifier")).toBe("ver");
    expect(form.get("client_secret")).toBeNull();

    const again = await refreshTokens(UBERSUGGEST_MCP, { clientId: "client-123", refreshToken: "rt" }, ok);
    expect(again.ok).toBe(true);
    expect(new URLSearchParams(seen[2]!.body).get("grant_type")).toBe("refresh_token");
  });

  it("reports a refused sign-in with the provider's reason and a dead server without inventing a token", async () => {
    const refused: typeof fetch = async () => json({ error: "invalid_grant", error_description: "code expired" }, 400);
    const r = await exchangeCode(UBERSUGGEST_MCP, { clientId: "c", redirectUri: "u", code: "x", verifier: "v" }, refused);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(!r.ok && r.detail).toContain("code expired");
    const down: typeof fetch = async () => {
      throw new Error("network");
    };
    expect(await registerClient(UBERSUGGEST_MCP, "u", down)).toMatchObject({ ok: false });
    expect(toTokenSet({})).toBeNull();
  });

  it("refreshes only when the token is about to expire", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(needsRefresh(new Date("2026-11-23T10:01:00Z"), now)).toBe(true);
    expect(needsRefresh(new Date("2026-11-23T11:00:00Z"), now)).toBe(false);
    expect(needsRefresh(null, now)).toBe(false);
    expect(toTokenSet({ access_token: "a", expires_in: 60 }, now)!.expiresAt!.toISOString()).toBe("2026-11-23T10:01:00.000Z");
  });
});

describe("MCP client", () => {
  it("reads a reply that is JSON or an event stream", () => {
    expect(parseRpcReply("application/json", '{"jsonrpc":"2.0","id":1,"result":{"a":1}}')).toMatchObject({ result: { a: 1 } });
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"b":2}}\n\n';
    expect(parseRpcReply("text/event-stream; charset=utf-8", sse)).toMatchObject({ result: { b: 2 } });
    expect(parseRpcReply("application/json", "not json")).toBeNull();
  });

  it("parses a tool's JSON text, and reports a tool error as an error", () => {
    expect(parseToolResult({ content: [{ type: "text", text: '{"domainAuthority":42}' }] })).toEqual({ ok: true, data: { domainAuthority: 42 } });
    expect(parseToolResult({ isError: true, content: [{ type: "text", text: "limit reached" }] })).toMatchObject({ ok: false, error: "tool_error", detail: "limit reached" });
    expect(parseToolResult({ content: [] })).toMatchObject({ ok: false, error: "protocol" });
  });

  it("initializes once, keeps the session id, and sends the bearer token on every call", async () => {
    const calls: { method: string; session: string | null; auth: string | null }[] = [];
    const server: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; id?: number };
      const h = new Headers(init?.headers);
      calls.push({ method: body.method, session: h.get("mcp-session-id"), auth: h.get("authorization") });
      if (body.method === "initialize") return json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } }, 200, { "mcp-session-id": "sess-1" });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: '{"ok":true}' }] } });
    };
    const s = new McpSession("https://mcp.example/mcp", "tok", server);
    expect(await s.callTool("auth_status", {})).toEqual({ ok: true, data: { ok: true } });
    expect(await s.callTool("auth_status", {})).toEqual({ ok: true, data: { ok: true } });
    expect(calls.map((c) => c.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    expect(calls[2]!.session).toBe("sess-1");
    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
  });

  it("says when the sign-in was rejected instead of returning data", async () => {
    const denied: typeof fetch = async () => json({ error: "invalid_token" }, 401);
    expect(await new McpSession("https://mcp.example/mcp", "bad", denied).callTool("x", {})).toMatchObject({ ok: false, error: "unauthorized" });
  });
});

describe("Ubersuggest replies", () => {
  it("reads the domain overview into the snapshot shape", () => {
    expect(normalizeOverview({ organic: 22, traffic: 0, domainAuthority: 42, backlinks: 531, refDomains: 337 })).toEqual({
      organicKeywords: 22,
      estimatedMonthlyTraffic: 0,
      domainAuthority: 42,
      backlinks: 531,
      referringDomains: 337,
    });
    expect(normalizeOverview({})).toBeNull();
  });

  it("reads ranking keywords, best position first, and skips malformed rows", () => {
    const rows = normalizeKeywords({
      results: [
        { position: 60, keyword: "repairing leaky gutters", search_intent: "Commercial", volume: 590, url: "http://x/fix/" },
        { position: 33, keyword: "tallahassee gutters", volume: 210 },
        { keyword: "no position" },
      ],
    });
    expect(rows.map((r) => r.keyword)).toEqual(["tallahassee gutters", "repairing leaky gutters"]);
    expect(rows[1]).toMatchObject({ intent: "Commercial", url: "http://x/fix/" });
    expect(normalizeKeywords(null)).toEqual([]);
  });

  it("keeps only organic search results and numbers them as organic ranks", () => {
    const { results, collectedAt } = serpToResults({
      updated_at: "2026-09-19",
      serpEntries: [
        { url: "http://a.com/", title: "A", position: 1, type: "local_pack" },
        { url: "http://NODOMAIN", position: 2, type: "people_also_ask" },
        { url: "http://b.com/", title: "B", position: 4, type: "organic" },
        { url: "http://c.com/", title: null, position: 5, type: "organic" },
      ],
    });
    expect(results).toEqual([
      { position: 1, url: "http://b.com/", title: "B" },
      { position: 2, url: "http://c.com/", title: "" },
    ]);
    expect(collectedAt!.toISOString().slice(0, 10)).toBe("2026-09-19");
    expect(serpToResults({}).results).toEqual([]);
  });

  it("adds the city to the search phrase only when it is not already there", () => {
    expect(serpQuery("roofing contractor", "Tallahassee")).toBe("roofing contractor tallahassee");
    expect(serpQuery("roofing contractor tallahassee", "Tallahassee")).toBe("roofing contractor tallahassee");
  });

  it("counts as connected only when its sign-in is on record", () => {
    const uber = getIntegration("ubersuggest")!;
    expect(uber.oauth).toBe(true);
    expect(integrationState(uber, {})).toBe("not_connected");
    expect(integrationState(uber, {}, ["ubersuggest"])).toBe("connected");
  });
});
