/**
 * Google Business Profile adapter (scope business.manage, used read-only apart
 * from accepting an invitation sent to the service account).
 * Observed numbers only. Pure helpers + thin fetch wrappers.
 */
type FetchLike = typeof fetch;

export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERF_API = "https://businessprofileperformance.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

export type GbpSyncState = "ok" | "error" | "needs_reauth" | "quota" | "forbidden" | "api_disabled" | "not_approved" | "never";

export const GBP_STATE_COPY: Record<GbpSyncState, string> = {
  ok: "Synced",
  never: "Not synced yet",
  error: "Google Business Profile is unavailable right now. Known data is unchanged; try again later.",
  needs_reauth: "Authorization expired or was revoked. Replace the service-account key, then try again.",
  quota: "Google Business Profile quota reached. Known data is unchanged; try again later.",
  forbidden: "This account cannot read the profile. Add the service-account email as a Manager on the Business Profile.",
  api_disabled: "The Business Profile APIs are not enabled in the Google Cloud project.",
  not_approved:
    "Google has not approved this project for the Business Profile APIs yet (its quota is 0). Submit Google's \"Application for Basic API Access\" form and wait for approval.",
};

/**
 * Map a provider reply to an actionable state. Google answers an unapproved
 * project with 429 and a quota limit of 0, which is not a real rate limit.
 */
export function classifyGbpError(status: number, body: string): GbpSyncState {
  if (status === 401) return "needs_reauth";
  if (status === 403 && /has not been used in project|it is disabled|SERVICE_DISABLED/i.test(body)) return "api_disabled";
  if (status === 403) return "forbidden";
  if (status === 429) {
    return /quota_limit_value"?\s*[:=]\s*"?0"?\b|limit[^.]{0,60}\b0\b per|'?Requests per minute'? .*\b0\b/i.test(body) ? "not_approved" : "quota";
  }
  if (status >= 400) return "error";
  return "ok";
}

export type GbpResult<T> = { ok: true; data: T } | { ok: false; state: GbpSyncState; detail: string };

async function call<T>(fetchImpl: FetchLike, token: string, url: string, init?: RequestInit): Promise<GbpResult<T>> {
  try {
    const res = await fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let reason = "";
      try {
        reason = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* body was not JSON */
      }
      return { ok: false, state: classifyGbpError(res.status, text), detail: `HTTP ${res.status}${reason ? `: ${reason.slice(0, 160)}` : ""}` };
    }
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch {
    return { ok: false, state: "error", detail: "No response from Google Business Profile" };
  }
}

// ---- accounts and invitations ---------------------------------------------------
export interface GbpAccount {
  name: string; // accounts/123
  accountName: string;
  type: string;
}

export function parseAccounts(json: unknown): GbpAccount[] {
  const rows = (json as { accounts?: { name?: string; accountName?: string; type?: string }[] } | null)?.accounts ?? [];
  return rows
    .filter((a) => /^accounts\/[\w-]+$/.test(a.name ?? ""))
    .map((a) => ({ name: a.name!, accountName: a.accountName ?? a.name!, type: a.type ?? "" }));
}

export async function gbpListAccounts(token: string, fetchImpl: FetchLike = fetch): Promise<GbpResult<GbpAccount[]>> {
  const r = await call<unknown>(fetchImpl, token, `${ACCOUNTS_API}/accounts?pageSize=20`);
  return r.ok ? { ok: true, data: parseAccounts(r.data) } : r;
}

/** Invitations waiting for this credential (someone added it as a manager). */
export async function gbpListInvitations(token: string, account: string, fetchImpl: FetchLike = fetch): Promise<GbpResult<string[]>> {
  const r = await call<{ invitations?: { name?: string }[] }>(fetchImpl, token, `${ACCOUNTS_API}/${account}/invitations`);
  if (!r.ok) return r;
  return { ok: true, data: (r.data.invitations ?? []).map((i) => i.name ?? "").filter((n) => /^accounts\/[\w-]+\/invitations\/[\w-]+$/.test(n)) };
}

export async function gbpAcceptInvitation(token: string, invitation: string, fetchImpl: FetchLike = fetch): Promise<GbpResult<true>> {
  const r = await call<unknown>(fetchImpl, token, `${ACCOUNTS_API}/${invitation}:accept`, { method: "POST", body: "{}" });
  return r.ok ? { ok: true, data: true } : r;
}

// ---- locations -------------------------------------------------------------------
export interface GbpLocationInfo {
  locationId: string; // locations/123
  title: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  mapsUri: string | null;
  placeId: string | null;
  /** Profile fields a customer looks for that are empty. */
  missing: string[];
}

const READ_MASK = "name,title,storefrontAddress,websiteUri,phoneNumbers,categories,regularHours,profile,metadata,serviceArea";

type RawLocation = {
  name?: string;
  title?: string;
  websiteUri?: string;
  phoneNumbers?: { primaryPhone?: string };
  categories?: { primaryCategory?: { displayName?: string } };
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
  regularHours?: { periods?: unknown[] };
  profile?: { description?: string };
  metadata?: { mapsUri?: string; placeId?: string };
  serviceArea?: unknown;
};

export function formatAddress(a: RawLocation["storefrontAddress"]): string | null {
  if (!a) return null;
  const cityLine = [a.locality, [a.administrativeArea, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const out = [...(a.addressLines ?? []), cityLine].filter(Boolean).join(", ");
  return out || null;
}

export function parseLocation(raw: unknown): GbpLocationInfo | null {
  const l = (raw ?? {}) as RawLocation;
  if (!/^locations\/[\w-]+$/.test(l.name ?? "")) return null;
  const address = formatAddress(l.storefrontAddress);
  const missing: string[] = [];
  if (!l.websiteUri) missing.push("Website");
  if (!l.phoneNumbers?.primaryPhone) missing.push("Phone number");
  if (!l.categories?.primaryCategory?.displayName) missing.push("Primary category");
  if (!l.regularHours?.periods?.length) missing.push("Opening hours");
  if (!l.profile?.description) missing.push("Business description");
  // A service-area business may hide its address on purpose; that is not a gap.
  if (!address && !l.serviceArea) missing.push("Address or service area");
  return {
    locationId: l.name!,
    title: l.title ?? l.name!,
    category: l.categories?.primaryCategory?.displayName ?? null,
    phone: l.phoneNumbers?.primaryPhone ?? null,
    website: l.websiteUri ?? null,
    address,
    mapsUri: l.metadata?.mapsUri ?? null,
    placeId: l.metadata?.placeId ?? null,
    missing,
  };
}

export async function gbpListLocations(token: string, account: string, fetchImpl: FetchLike = fetch): Promise<GbpResult<GbpLocationInfo[]>> {
  const out: GbpLocationInfo[] = [];
  let pageToken = "";
  for (let i = 0; i < 20; i++) {
    const r = await call<{ locations?: unknown[]; nextPageToken?: string }>(
      fetchImpl,
      token,
      `${INFO_API}/${account}/locations?readMask=${READ_MASK}&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    if (!r.ok) return r;
    (r.data.locations ?? []).forEach((raw) => {
      const l = parseLocation(raw);
      if (l) out.push(l);
    });
    pageToken = r.data.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return { ok: true, data: out };
}

// ---- performance -----------------------------------------------------------------
export const GBP_DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;

export interface GbpDay {
  date: string; // YYYY-MM-DD
  searchViews: number;
  mapsViews: number;
  calls: number;
  websiteClicks: number;
  directions: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Last 28 days ending 3 days ago: Google's profile numbers for the latest days are incomplete. */
export function defaultGbpPeriod(now: Date = new Date()): { start: Date; end: Date; startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const start = new Date(end.getTime() - 27 * 86_400_000);
  return { start, end, startDate: ymd(start), endDate: ymd(end) };
}

const FIELD_OF: Record<string, keyof Omit<GbpDay, "date">> = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "mapsViews",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "mapsViews",
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_DIRECTION_REQUESTS: "directions",
};

/** Fold Google's per-metric series into one row per day (a day Google omits a value for counts as 0 for that metric). */
export function parseDailyMetrics(json: unknown): GbpDay[] {
  const days: Record<string, GbpDay> = {};
  const groups = (json as { multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: unknown[] }[] } | null)?.multiDailyMetricTimeSeries ?? [];
  groups.forEach((g) =>
    (g.dailyMetricTimeSeries ?? []).forEach((s) => {
      const series = s as { dailyMetric?: string; timeSeries?: { datedValues?: { date?: { year?: number; month?: number; day?: number }; value?: string | number }[] } };
      const field = FIELD_OF[series.dailyMetric ?? ""];
      if (!field) return;
      (series.timeSeries?.datedValues ?? []).forEach((v) => {
        const d = v.date;
        if (!d?.year || !d.month || !d.day) return;
        const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        const row = (days[key] = days[key] ?? { date: key, searchViews: 0, mapsViews: 0, calls: 0, websiteClicks: 0, directions: 0 });
        const n = Number(v.value ?? 0);
        if (Number.isFinite(n)) row[field] += Math.round(n);
      });
    }),
  );
  return Object.keys(days)
    .sort()
    .map((k) => days[k]!);
}

export function sumDays(days: GbpDay[]): Omit<GbpDay, "date"> {
  return days.reduce(
    (a, d) => ({
      searchViews: a.searchViews + d.searchViews,
      mapsViews: a.mapsViews + d.mapsViews,
      calls: a.calls + d.calls,
      websiteClicks: a.websiteClicks + d.websiteClicks,
      directions: a.directions + d.directions,
    }),
    { searchViews: 0, mapsViews: 0, calls: 0, websiteClicks: 0, directions: 0 },
  );
}

export function dailyMetricsUrl(locationId: string, start: Date, end: Date): string {
  const q: string[] = GBP_DAILY_METRICS.map((m) => `dailyMetrics=${m}`);
  const part = (prefix: string, d: Date) =>
    q.push(`${prefix}.year=${d.getUTCFullYear()}`, `${prefix}.month=${d.getUTCMonth() + 1}`, `${prefix}.day=${d.getUTCDate()}`);
  part("dailyRange.start_date", start);
  part("dailyRange.end_date", end);
  return `${PERF_API}/${locationId}:fetchMultiDailyMetricsTimeSeries?${q.join("&")}`;
}

export async function gbpDailyMetrics(token: string, locationId: string, start: Date, end: Date, fetchImpl: FetchLike = fetch): Promise<GbpResult<GbpDay[]>> {
  const r = await call<unknown>(fetchImpl, token, dailyMetricsUrl(locationId, start, end));
  return r.ok ? { ok: true, data: parseDailyMetrics(r.data) } : r;
}

// ---- reviews ---------------------------------------------------------------------
export interface GbpReviewSummary {
  rating: number | null;
  reviewCount: number;
}

export function parseReviewSummary(json: unknown): GbpReviewSummary {
  const j = (json ?? {}) as { averageRating?: number; totalReviewCount?: number };
  const rating = typeof j.averageRating === "number" && j.averageRating > 0 ? Math.round(j.averageRating * 100) / 100 : null;
  return { rating, reviewCount: typeof j.totalReviewCount === "number" ? j.totalReviewCount : 0 };
}

export async function gbpReviewSummary(token: string, account: string, locationId: string, fetchImpl: FetchLike = fetch): Promise<GbpResult<GbpReviewSummary>> {
  const r = await call<unknown>(fetchImpl, token, `${REVIEWS_API}/${account}/${locationId}/reviews?pageSize=1`);
  return r.ok ? { ok: true, data: parseReviewSummary(r.data) } : r;
}
