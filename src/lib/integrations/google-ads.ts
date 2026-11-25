/**
 * Google Ads adapter. Reads only: the service account is added to an Ads
 * account as a "Read only" user, and this module sends search queries and
 * nothing else. Observed numbers only. Pure helpers + thin fetch wrappers.
 *
 * Access is decided on Google's side: the app can see exactly the accounts the
 * service-account email was added to, and no others.
 */
type FetchLike = typeof fetch;

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const GOOGLE_ADS_API = "https://googleads.googleapis.com/v26";

export type AdsState = "ok" | "inactive" | "forbidden" | "not_approved" | "quota" | "needs_reauth" | "error";

export const ADS_STATE_COPY: Record<AdsState, string> = {
  ok: "Synced",
  inactive: "This Google Ads account is cancelled or not yet enabled, so Google returns no data for it.",
  forbidden: "The service account cannot read this account. Add its email as a Read only user in Google Ads > Admin > Access and security.",
  not_approved: "The Google Cloud project is not approved for real Ads accounts yet. Apply for Explorer access on the Google Ads API page in Google Cloud.",
  quota: "Google Ads quota reached. Known data is unchanged; sync again later.",
  needs_reauth: "Authorization expired or was revoked. Replace the service-account key, then sync again.",
  error: "Google Ads is unavailable right now. Known data is unchanged; try again later.",
};

/** "3026101423" -> "302-610-1423" (how Google Ads shows an account number). */
export function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : id;
}

/** The first Google Ads error code in a failure body, e.g. "CUSTOMER_NOT_ENABLED". */
export function adsErrorCode(body: unknown): { kind: string; code: string } | null {
  const details = (body as { error?: { details?: unknown[] } } | null)?.error?.details ?? [];
  for (const d of details) {
    for (const e of (d as { errors?: { errorCode?: Record<string, unknown> }[] }).errors ?? []) {
      const entry = Object.entries(e.errorCode ?? {})[0];
      if (entry && typeof entry[1] === "string") return { kind: entry[0], code: entry[1] };
    }
  }
  return null;
}

export function classifyAdsFailure(status: number, body: unknown): { state: AdsState; code: string | null } {
  const err = adsErrorCode(body);
  const code = err?.code ?? null;
  if (code === "CUSTOMER_NOT_ENABLED") return { state: "inactive", code };
  if (code === "USER_PERMISSION_DENIED" || code === "NOT_ADS_USER") return { state: "forbidden", code };
  if (code === "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" || code === "DEVELOPER_TOKEN_NOT_APPROVED") {
    return { state: "not_approved", code };
  }
  if (err?.kind === "quotaError" || status === 429) return { state: "quota", code };
  if (status === 401) return { state: "needs_reauth", code };
  if (status === 403) return { state: "forbidden", code };
  return { state: "error", code };
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Account ids from customers:listAccessibleCustomers. */
export function parseAccessibleCustomers(json: unknown): string[] {
  const names = (json as { resourceNames?: unknown[] } | null)?.resourceNames ?? [];
  return names
    .map((n) => (typeof n === "string" ? (n.match(/^customers\/(\d+)$/)?.[1] ?? null) : null))
    .filter((id): id is string => id !== null);
}

export interface AdsCustomer {
  id: string;
  name: string | null;
  currency: string | null;
  manager: boolean;
}

export function parseCustomer(results: unknown[]): AdsCustomer | null {
  const c = (results[0] as { customer?: Record<string, unknown> } | undefined)?.customer;
  if (!c || c.id === undefined) return null;
  return {
    id: String(c.id),
    name: typeof c.descriptiveName === "string" && c.descriptiveName ? c.descriptiveName : null,
    currency: typeof c.currencyCode === "string" ? c.currencyCode : null,
    manager: c.manager === true,
  };
}

/** Enabled, non-manager accounts under a manager account. */
export function parseClientAccounts(results: unknown[]): { id: string; name: string | null }[] {
  return results
    .map((r) => (r as { customerClient?: Record<string, unknown> }).customerClient)
    .filter((c): c is Record<string, unknown> => !!c && c.id !== undefined && c.manager !== true)
    .map((c) => ({ id: String(c.id), name: typeof c.descriptiveName === "string" && c.descriptiveName ? c.descriptiveName : null }));
}

export interface AdsCampaignRow {
  campaignId: string;
  name: string;
  status: string;
  /** Cost in the account's currency, in hundredths (cents). */
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

/** Google reports cost in millionths of the currency unit. */
export const microsToCents = (micros: number) => Math.round(micros / 10_000);

export function parseCampaignRows(results: unknown[]): AdsCampaignRow[] {
  const out: AdsCampaignRow[] = [];
  for (const r of results) {
    const row = r as { campaign?: Record<string, unknown>; metrics?: Record<string, unknown> };
    if (!row.campaign || row.campaign.id === undefined) continue;
    const m = row.metrics ?? {};
    out.push({
      campaignId: String(row.campaign.id),
      name: typeof row.campaign.name === "string" && row.campaign.name ? row.campaign.name : `Campaign ${String(row.campaign.id)}`,
      status: typeof row.campaign.status === "string" ? row.campaign.status : "UNKNOWN",
      spendCents: microsToCents(num(m.costMicros)),
      impressions: Math.round(num(m.impressions)),
      clicks: Math.round(num(m.clicks)),
      conversions: num(m.conversions),
    });
  }
  return out;
}

export const CUSTOMER_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1";

export const CLIENT_ACCOUNTS_QUERY =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager FROM customer_client " +
  "WHERE customer_client.level <= 1 AND customer_client.manager = FALSE AND customer_client.status = 'ENABLED'";

/** Totals per campaign for the last 30 days. */
export const CAMPAIGN_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions " +
  "FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'";

export type AdsCall<T> = { ok: true; value: T } | { ok: false; state: AdsState; code: string | null; status: number };

async function readFailure<T>(res: Response): Promise<AdsCall<T>> {
  const body = (await res.json().catch(() => null)) as unknown;
  return { ok: false, status: res.status, ...classifyAdsFailure(res.status, body) };
}

export async function listAccessibleCustomers(token: string, fetchImpl: FetchLike = fetch): Promise<AdsCall<string[]>> {
  try {
    const res = await fetchImpl(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return readFailure(res);
    return { ok: true, value: parseAccessibleCustomers(await res.json()) };
  } catch {
    return { ok: false, state: "error", code: null, status: 0 };
  }
}

/** Run one read-only query against an account and collect every page of rows. */
export async function adsSearch(
  token: string,
  customerId: string,
  query: string,
  opts: { loginCustomerId?: string; fetchImpl?: FetchLike } = {},
): Promise<AdsCall<unknown[]>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  if (opts.loginCustomerId) headers["login-customer-id"] = opts.loginCustomerId;
  const rows: unknown[] = [];
  let pageToken: string | undefined;
  try {
    for (let page = 0; page < 20; page += 1) {
      const res = await fetchImpl(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`, {
        method: "POST",
        headers,
        body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return readFailure(res);
      const json = (await res.json()) as { results?: unknown[]; nextPageToken?: string };
      rows.push(...(json.results ?? []));
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return { ok: true, value: rows };
  } catch {
    return { ok: false, state: "error", code: null, status: 0 };
  }
}
