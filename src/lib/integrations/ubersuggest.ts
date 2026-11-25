import { prisma } from "@/lib/prisma";
import { open, seal } from "@/lib/crypto/seal";
import { McpSession, type McpResult } from "@/lib/integrations/mcp-client";
import { UBERSUGGEST_MCP, needsRefresh, refreshTokens } from "@/lib/integrations/mcp-oauth";
import type { SerpProvider } from "@/lib/prospecting/agent";
import type { SerpResult } from "@/lib/prospecting/rules";

/**
 * Ubersuggest through its MCP server. The app signs in once with OAuth and
 * then calls the same tools Claude uses. Server only.
 */
type FetchLike = typeof fetch;
export const UBERSUGGEST = "ubersuggest";
/** Google location id for the United States (city-level ids return no search results). */
const US = 2840;

// ---- reading replies (pure) ---------------------------------------------------------
export interface OverviewSnapshot {
  organicKeywords?: number;
  estimatedMonthlyTraffic?: number;
  domainAuthority?: number;
  backlinks?: number;
  referringDomains?: number;
}

const numOrUndef = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function normalizeOverview(raw: unknown): OverviewSnapshot | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: OverviewSnapshot = {
    organicKeywords: numOrUndef(r.organic),
    estimatedMonthlyTraffic: numOrUndef(r.traffic),
    domainAuthority: numOrUndef(r.domainAuthority),
    backlinks: numOrUndef(r.backlinks),
    referringDomains: numOrUndef(r.refDomains),
  };
  return Object.keys(out).some((k) => out[k as keyof OverviewSnapshot] !== undefined) ? out : null;
}

export interface KeywordRow {
  keyword: string;
  position: number;
  volume: number;
  url?: string;
  intent?: string;
}

export function normalizeKeywords(raw: unknown): KeywordRow[] {
  const rows = (raw as { results?: unknown[] } | null)?.results ?? [];
  const out: KeywordRow[] = [];
  rows.forEach((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.keyword !== "string" || typeof r.position !== "number") return;
    out.push({
      keyword: r.keyword,
      position: r.position,
      volume: typeof r.volume === "number" ? r.volume : 0,
      url: typeof r.url === "string" ? r.url : undefined,
      intent: typeof r.search_intent === "string" ? r.search_intent : undefined,
    });
  });
  return out.sort((a, b) => a.position - b.position);
}

/** Organic results only, renumbered 1, 2, 3… so a position always means the organic rank. */
export function serpToResults(raw: unknown): { results: SerpResult[]; collectedAt: Date | null } {
  const r = (raw ?? {}) as { serpEntries?: unknown[]; updated_at?: unknown };
  const results: SerpResult[] = [];
  (r.serpEntries ?? []).forEach((x) => {
    const e = (x ?? {}) as Record<string, unknown>;
    if (e.type !== "organic" || typeof e.url !== "string" || e.url.indexOf("NODOMAIN") !== -1) return;
    results.push({ position: results.length + 1, url: e.url, title: typeof e.title === "string" ? e.title : "" });
  });
  const collectedAt = typeof r.updated_at === "string" && !Number.isNaN(Date.parse(r.updated_at)) ? new Date(r.updated_at) : null;
  return { results, collectedAt };
}

/** "roofing contractor" + "Tallahassee" → "roofing contractor tallahassee" (not repeated if already there). */
export function serpQuery(keyword: string, city: string): string {
  const k = keyword.trim();
  const c = city.trim();
  return k.toLowerCase().indexOf(c.toLowerCase()) !== -1 ? k : `${k} ${c}`.toLowerCase();
}

// ---- connection -----------------------------------------------------------------------
export type UbersuggestState = "connected" | "not_connected" | "needs_reauth";

export async function ubersuggestState(organizationId: string): Promise<UbersuggestState> {
  const c = await prisma.oAuthConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: UBERSUGGEST } },
    select: { status: true, accessTokenEnc: true },
  });
  if (!c || !c.accessTokenEnc) return "not_connected";
  return c.status === "connected" ? "connected" : "needs_reauth";
}

type TokenOutcome = { ok: true; token: string } | { ok: false; state: UbersuggestState; detail: string };

/** A usable access token, refreshed and stored again when it is about to expire. */
export async function ubersuggestToken(organizationId: string, fetchImpl: FetchLike = fetch): Promise<TokenOutcome> {
  const c = await prisma.oAuthConnection.findUnique({ where: { organizationId_provider: { organizationId, provider: UBERSUGGEST } } });
  if (!c || !c.accessTokenEnc) return { ok: false, state: "not_connected", detail: "Ubersuggest is not connected" };
  const access = open(c.accessTokenEnc);
  const refresh = open(c.refreshTokenEnc);
  if (access && !needsRefresh(c.expiresAt)) return { ok: true, token: access };
  if (!refresh) {
    if (access && !c.expiresAt) return { ok: true, token: access };
    await prisma.oAuthConnection.update({ where: { id: c.id }, data: { status: "needs_reauth", lastError: "Sign-in expired" } });
    return { ok: false, state: "needs_reauth", detail: "The Ubersuggest sign-in expired. Connect again." };
  }
  const r = await refreshTokens(UBERSUGGEST_MCP, { clientId: c.clientId, refreshToken: refresh }, fetchImpl);
  if (!r.ok) {
    // 400/401 means the refresh token is no longer valid; anything else is temporary.
    const dead = r.status === 400 || r.status === 401;
    if (dead) await prisma.oAuthConnection.update({ where: { id: c.id }, data: { status: "needs_reauth", lastError: r.detail } });
    return dead
      ? { ok: false, state: "needs_reauth", detail: "The Ubersuggest sign-in is no longer valid. Connect again." }
      : access
        ? { ok: true, token: access }
        : { ok: false, state: "connected", detail: `Ubersuggest could not be reached (${r.detail})` };
  }
  await prisma.oAuthConnection.update({
    where: { id: c.id },
    data: {
      accessTokenEnc: seal(r.data.accessToken),
      refreshTokenEnc: r.data.refreshToken ? seal(r.data.refreshToken) : c.refreshTokenEnc,
      expiresAt: r.data.expiresAt,
      status: "connected",
      lastError: null,
    },
  });
  return { ok: true, token: r.data.accessToken };
}

export type UbersuggestResult<T> = { ok: true; data: T } | { ok: false; state: UbersuggestState; detail: string };

async function withSession<T>(
  organizationId: string,
  run: (call: (tool: string, args: Record<string, unknown>) => Promise<McpResult<unknown>>) => Promise<UbersuggestResult<T>>,
  fetchImpl: FetchLike = fetch,
): Promise<UbersuggestResult<T>> {
  const t = await ubersuggestToken(organizationId, fetchImpl);
  if (!t.ok) return t;
  const session = new McpSession(UBERSUGGEST_MCP.resource, t.token, fetchImpl);
  let unauthorized = false;
  const result = await run(async (tool, args) => {
    const r = await session.callTool(tool, args);
    if (!r.ok && r.error === "unauthorized") unauthorized = true;
    return r;
  });
  if (unauthorized) {
    await prisma.oAuthConnection.updateMany({
      where: { organizationId, provider: UBERSUGGEST },
      data: { status: "needs_reauth", lastError: "Ubersuggest rejected the sign-in" },
    });
    return { ok: false, state: "needs_reauth", detail: "Ubersuggest rejected the sign-in. Connect again." };
  }
  return result;
}

const fail = <T>(r: { detail: string }): UbersuggestResult<T> => ({ ok: false, state: "connected", detail: r.detail });

/** Who the connection belongs to and its plan: proves the sign-in works. */
export function testUbersuggest(organizationId: string, fetchImpl?: FetchLike): Promise<UbersuggestResult<{ summary: string }>> {
  return withSession(
    organizationId,
    async (call) => {
      const r = await call("auth_status", {});
      if (!r.ok) return fail(r);
      const d = (r.data ?? {}) as Record<string, unknown>;
      const tier = typeof d.tier === "string" ? d.tier : typeof d.plan === "string" ? d.plan : null;
      return { ok: true, data: { summary: tier ? `Signed in (plan: ${tier})` : "Signed in" } };
    },
    fetchImpl,
  );
}

/**
 * Store a fresh snapshot for one domain: overview and ranking keywords. Each
 * refresh adds rows, so earlier snapshots stay as history. If Ubersuggest
 * fails, nothing is stored.
 */
export function refreshUbersuggestSnapshot(
  organizationId: string,
  domain: string,
  fetchImpl?: FetchLike,
): Promise<UbersuggestResult<{ keywords: number; overview: boolean }>> {
  const clean = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return withSession(
    organizationId,
    async (call) => {
      const overview = await call("domain_overview", { domain: clean, locId: US });
      if (!overview.ok) return fail(overview);
      const keywords = await call("domain_keywords", { domain: clean, locId: US, limit: 50 });
      if (!keywords.ok) return fail(keywords);
      const o = normalizeOverview(overview.data);
      const rows = normalizeKeywords(keywords.data);
      const observedAt = new Date();
      await prisma.seoSnapshot.createMany({
        data: [
          ...(o ? [{ organizationId, domain: clean, provider: UBERSUGGEST, kind: "domain_overview", location: "United States", data: o as object, observedAt }] : []),
          { organizationId, domain: clean, provider: UBERSUGGEST, kind: "keywords", location: "United States", data: { rows } as object, observedAt },
        ],
      });
      return { ok: true, data: { keywords: rows.length, overview: !!o } };
    },
    fetchImpl,
  );
}

/**
 * Search provider for the prospecting agent. Uses Ubersuggest's stored search
 * results (no credits); it never asks for a paid live refresh.
 */
export function ubersuggestSerpProvider(organizationId: string, fetchImpl?: FetchLike): SerpProvider {
  let collected: Date | null = null;
  return {
    name: "ubersuggest",
    collectedAt: () => collected,
    async search(query, location) {
      const city = location.split(",")[0] ?? "";
      const r = await withSession<SerpResult[]>(
        organizationId,
        async (call) => {
          const s = await call("serp_analysis", { keyword: serpQuery(query, city), locId: US, limit: 50 });
          if (!s.ok) return fail(s);
          const parsed = serpToResults(s.data);
          collected = parsed.collectedAt;
          return { ok: true, data: parsed.results };
        },
        fetchImpl,
      );
      if (!r.ok) throw new Error(r.detail);
      if (r.data.length === 0) throw new Error("Ubersuggest has no stored search results for this phrase");
      return r.data;
    },
  };
}
