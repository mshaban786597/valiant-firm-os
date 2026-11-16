/**
 * Google Search Console adapter (read-only: webmasters.readonly).
 * Observed metrics only — never estimated. Pure helpers + thin fetch wrappers.
 */
type FetchLike = typeof fetch;

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://www.googleapis.com/webmasters/v3";

export type GscSyncState = "ok" | "error" | "needs_reauth" | "quota" | "forbidden" | "never";

/** Map a provider HTTP status to an actionable sync state. */
export function classifyGscStatus(status: number): GscSyncState {
  if (status === 401) return "needs_reauth";
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status >= 400) return "error";
  return "ok";
}

export const GSC_STATE_COPY: Record<GscSyncState, string> = {
  ok: "Synced",
  never: "Not synced yet",
  error: "Search Console is unavailable right now. Known data is unchanged; try again later.",
  needs_reauth: "Authorization expired or was revoked. Replace the service-account key, then test access.",
  quota: "Search Console quota reached. Known data is unchanged; sync again later.",
  forbidden: "This account cannot read the property. Add the service-account email as a user on the property in Search Console.",
};

/** "sc-domain:example.com" is a Domain property; anything else is a URL-prefix property. */
export function propertyTypeOf(siteUrl: string): "domain" | "url_prefix" {
  return siteUrl.toLowerCase().startsWith("sc-domain:") ? "domain" : "url_prefix";
}

/** Aggregate CTR from eligible clicks and impressions (never an average of row CTRs). */
export function aggregateCtr(clicks: number, impressions: number): number | null {
  return impressions > 0 ? clicks / impressions : null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Default reporting window: the last 28 complete days ending 3 days ago
 * (Search Console data for the most recent days is still incomplete).
 */
export function defaultGscPeriod(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const start = new Date(end.getTime() - 27 * 86_400_000);
  return { startDate: ymd(start), endDate: ymd(end) };
}

export interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export type GscResult<T> = { ok: true; data: T } | { ok: false; state: GscSyncState; detail: string };

async function call<T>(fetchImpl: FetchLike, token: string, url: string, init?: RequestInit): Promise<GscResult<T>> {
  try {
    const res = await fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const state = classifyGscStatus(res.status);
      return { ok: false, state, detail: `HTTP ${res.status}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, state: "error", detail: "No response from Search Console" };
  }
}

/** Properties this credential can read, with their permission level. */
export async function gscListSites(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<GscResult<{ siteUrl: string; permissionLevel: string }[]>> {
  const r = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(fetchImpl, token, `${API}/sites`);
  return r.ok ? { ok: true, data: r.data.siteEntry ?? [] } : r;
}

/** Verify that the exact property identifier is readable before any sync. */
export async function gscTestAccess(
  token: string,
  siteUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<GscResult<{ permissionLevel: string }>> {
  const sites = await gscListSites(token, fetchImpl);
  if (!sites.ok) return sites;
  const match = sites.data.filter((s) => s.siteUrl === siteUrl)[0];
  if (!match) {
    return {
      ok: false,
      state: "forbidden",
      detail: `Property "${siteUrl}" is not visible to this account (${sites.data.length} properties are)`,
    };
  }
  if (match.permissionLevel === "siteUnverifiedUser") {
    return { ok: false, state: "forbidden", detail: "The account is an unverified user on this property" };
  }
  return { ok: true, data: { permissionLevel: match.permissionLevel } };
}

/**
 * Search Analytics query with pagination. `dimension: null` returns the
 * property totals as a single row keyed "total".
 */
export async function gscQuery(input: {
  token: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimension: "query" | "page" | null;
  searchType?: string;
  rowLimit?: number;
  maxRows?: number;
  fetchImpl?: FetchLike;
}): Promise<GscResult<GscRow[]>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const rowLimit = input.rowLimit ?? 5000;
  const maxRows = input.maxRows ?? 25_000;
  const url = `${API}/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`;
  const rows: GscRow[] = [];
  let startRow = 0;

  for (;;) {
    const r = await call<{
      rows?: { keys?: string[]; clicks: number; impressions: number; position?: number }[];
    }>(fetchImpl, input.token, url, {
      method: "POST",
      body: JSON.stringify({
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: input.dimension ? [input.dimension] : [],
        type: input.searchType ?? "web",
        rowLimit,
        startRow,
      }),
    });
    if (!r.ok) return r;
    const page = r.data.rows ?? [];
    page.forEach((row) =>
      rows.push({
        key: input.dimension ? (row.keys?.[0] ?? "") : "total",
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        position: typeof row.position === "number" ? row.position : null,
      }),
    );
    if (!input.dimension || page.length < rowLimit || rows.length >= maxRows) break;
    startRow += rowLimit;
  }
  return { ok: true, data: rows };
}
