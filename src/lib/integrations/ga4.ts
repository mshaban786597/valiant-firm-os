/**
 * Google Analytics 4 adapter (read-only: analytics.readonly).
 * Observed numbers only. Pure helpers + thin fetch wrappers.
 */
type FetchLike = typeof fetch;

export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

export type Ga4SyncState = "ok" | "error" | "needs_reauth" | "quota" | "forbidden" | "never";

export function classifyGa4Status(status: number): Ga4SyncState {
  if (status === 401) return "needs_reauth";
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status >= 400) return "error";
  return "ok";
}

export const GA4_STATE_COPY: Record<Ga4SyncState, string> = {
  ok: "Synced",
  never: "Not synced yet",
  error: "Google Analytics is unavailable right now. Known data is unchanged; try again later.",
  needs_reauth: "Authorization expired or was revoked. Replace the service-account key, then sync again.",
  quota: "Google Analytics quota reached. Known data is unchanged; sync again later.",
  forbidden: "This account cannot read the property. Add the service-account email as a Viewer in Analytics > Admin > Account access management.",
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The last 28 complete days (ending yesterday) and the 28 days before them. */
export function defaultGa4Periods(now: Date = new Date()): {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
} {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - 27 * 86_400_000);
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - 27 * 86_400_000);
  return {
    current: { startDate: ymd(start), endDate: ymd(end) },
    previous: { startDate: ymd(prevStart), endDate: ymd(prevEnd) },
  };
}

export interface Ga4PropertySummary {
  propertyId: string;
  displayName: string;
  accountId: string;
  accountName: string;
}

/** Flatten the Admin API account summaries into one row per property. */
export function parseAccountSummaries(json: unknown): Ga4PropertySummary[] {
  const out: Ga4PropertySummary[] = [];
  const accounts = (json as { accountSummaries?: unknown[] } | null)?.accountSummaries ?? [];
  accounts.forEach((a) => {
    const acc = a as { account?: string; displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] };
    (acc.propertySummaries ?? []).forEach((p) => {
      const id = (p.property ?? "").replace(/^properties\//, "");
      if (!/^\d+$/.test(id)) return;
      out.push({
        propertyId: id,
        displayName: p.displayName ?? id,
        accountId: (acc.account ?? "").replace(/^accounts\//, ""),
        accountName: acc.displayName ?? "",
      });
    });
  });
  return out;
}

export interface Ga4ReportRow {
  dims: string[];
  values: number[];
}

/** Rows of a runReport response as plain numbers (missing values become 0 only inside a returned row). */
export function parseReport(json: unknown): Ga4ReportRow[] {
  const rows = (json as { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] } | null)?.rows ?? [];
  return rows.map((r) => ({
    dims: (r.dimensionValues ?? []).map((d) => d.value ?? ""),
    values: (r.metricValues ?? []).map((m) => {
      const n = Number(m.value);
      return Number.isFinite(n) ? n : 0;
    }),
  }));
}

/** "20261103" → "2026-11-03" */
export function ga4Date(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

/** Percentage change, or null when there is no earlier number to compare with. */
export function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export type Ga4Result<T> = { ok: true; data: T } | { ok: false; state: Ga4SyncState; detail: string };

async function call<T>(fetchImpl: FetchLike, token: string, url: string, init?: RequestInit): Promise<Ga4Result<T>> {
  try {
    const res = await fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      let reason = "";
      try {
        reason = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* body was not JSON */
      }
      return { ok: false, state: classifyGa4Status(res.status), detail: `HTTP ${res.status}${reason ? `: ${reason.slice(0, 160)}` : ""}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, state: "error", detail: "No response from Google Analytics" };
  }
}

/** Every property the credential can read. */
export async function ga4ListProperties(token: string, fetchImpl: FetchLike = fetch): Promise<Ga4Result<Ga4PropertySummary[]>> {
  const out: Ga4PropertySummary[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const r = await call<{ nextPageToken?: string }>(
      fetchImpl,
      token,
      `${ADMIN_API}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    if (!r.ok) return r;
    parseAccountSummaries(r.data).forEach((p) => out.push(p));
    pageToken = r.data.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return { ok: true, data: out };
}

/** The website address of the property's web data stream, if it has one. */
export async function ga4WebsiteUrl(token: string, propertyId: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const r = await call<{ dataStreams?: { type?: string; webStreamData?: { defaultUri?: string } }[] }>(
    fetchImpl,
    token,
    `${ADMIN_API}/properties/${propertyId}/dataStreams`,
  );
  if (!r.ok) return null;
  const web = (r.data.dataStreams ?? []).filter((s) => s.type === "WEB_DATA_STREAM" && s.webStreamData?.defaultUri)[0];
  return web?.webStreamData?.defaultUri ?? null;
}

export const GA4_METRICS = ["sessions", "totalUsers", "newUsers", "keyEvents", "engagedSessions", "screenPageViews", "userEngagementDuration"] as const;

export async function ga4RunReport(
  token: string,
  propertyId: string,
  opts: { startDate: string; endDate: string; dimension?: string; limit?: number },
  fetchImpl: FetchLike = fetch,
): Promise<Ga4Result<Ga4ReportRow[]>> {
  const body = {
    dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
    metrics: GA4_METRICS.map((name) => ({ name })),
    ...(opts.dimension
      ? {
          dimensions: [{ name: opts.dimension }],
          orderBys:
            opts.dimension === "date"
              ? [{ dimension: { dimensionName: "date" } }]
              : [{ metric: { metricName: "sessions" }, desc: true }],
        }
      : {}),
    limit: String(opts.limit ?? 50),
  };
  const r = await call<unknown>(fetchImpl, token, `${DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return r.ok ? { ok: true, data: parseReport(r.data) } : r;
}

export interface Ga4Totals {
  sessions: number;
  users: number;
  newUsers: number;
  keyEvents: number;
  engagedSessions: number;
  views: number;
  engagementSeconds: number;
}

/** Map a metric row (in GA4_METRICS order) to named totals. */
export function toTotals(values: number[]): Ga4Totals {
  return {
    sessions: Math.round(values[0] ?? 0),
    users: Math.round(values[1] ?? 0),
    newUsers: Math.round(values[2] ?? 0),
    keyEvents: Math.round(values[3] ?? 0),
    engagedSessions: Math.round(values[4] ?? 0),
    views: Math.round(values[5] ?? 0),
    engagementSeconds: values[6] ?? 0,
  };
}

/** Engaged sessions ÷ sessions, or null when there were no sessions. */
export function engagementRate(t: Pick<Ga4Totals, "engagedSessions" | "sessions">): number | null {
  return t.sessions > 0 ? t.engagedSessions / t.sessions : null;
}
