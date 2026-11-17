import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import {
  GSC_SCOPE,
  GSC_STATE_COPY,
  defaultGscPeriod,
  gscQuery,
  gscTestAccess,
  propertyTypeOf,
  type GscSyncState,
} from "@/lib/integrations/gsc";

type FetchLike = typeof fetch;
type Env = Record<string, string | undefined>;

export interface GscOpResult {
  ok: boolean;
  state: GscSyncState | "not_configured";
  message: string;
  rows?: number;
  clicks?: number;
  impressions?: number;
  period?: { startDate: string; endDate: string };
}

function tokenState(kind: string): GscSyncState {
  return kind === "needs_reauth" || kind === "invalid_credentials" ? "needs_reauth" : "error";
}

/** Verify read access to the exact property identifier. Writes only the attempt + state. */
export async function testGscAccess(
  property: { id: string; siteUrl: string },
  deps: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<GscOpResult> {
  const token = await getGoogleAccessToken([GSC_SCOPE], deps.env, deps.fetchImpl);
  if (!token.ok) {
    if (token.kind === "not_configured") {
      return { ok: false, state: "not_configured", message: "No Google credential is configured (GOOGLE_SERVICE_ACCOUNT_JSON)." };
    }
    const state = tokenState(token.kind);
    await prisma.gscProperty.update({
      where: { id: property.id },
      data: { lastAttemptAt: new Date(), syncState: state, lastError: token.detail },
    });
    return { ok: false, state, message: `${GSC_STATE_COPY[state]} (${token.detail})` };
  }
  const access = await gscTestAccess(token.token, property.siteUrl, deps.fetchImpl);
  if (!access.ok) {
    await prisma.gscProperty.update({
      where: { id: property.id },
      data: { lastAttemptAt: new Date(), syncState: access.state, lastError: access.detail },
    });
    return { ok: false, state: access.state, message: `${GSC_STATE_COPY[access.state]} (${access.detail})` };
  }
  await prisma.gscProperty.update({
    where: { id: property.id },
    data: {
      lastAttemptAt: new Date(),
      verified: true,
      lastError: null,
      propertyType: propertyTypeOf(property.siteUrl),
      disconnectedAt: null,
    },
  });
  return { ok: true, state: "ok", message: `Read access verified (${access.data.permissionLevel}) as ${token.account}.` };
}

/**
 * Sync observed Search Console metrics for one property and period.
 *
 * - access is verified against the exact property identifier first
 * - totals, queries and pages are stored per period with a unique key, so
 *   replaying the same sync upserts instead of duplicating
 * - on ANY failure the previously known data is left untouched; only the
 *   attempt time, state and error are recorded (never zeros)
 */
export async function syncGscProperty(
  property: { id: string; siteUrl: string; searchType?: string },
  deps: { env?: Env; fetchImpl?: FetchLike; now?: Date; rowLimit?: number } = {},
): Promise<GscOpResult> {
  const now = deps.now ?? new Date();
  const searchType = property.searchType ?? "web";
  const fail = async (state: GscSyncState, detail: string): Promise<GscOpResult> => {
    await prisma.gscProperty.update({
      where: { id: property.id },
      data: { lastAttemptAt: now, syncState: state, lastError: detail },
    });
    return { ok: false, state, message: `${GSC_STATE_COPY[state]} (${detail})` };
  };

  const token = await getGoogleAccessToken([GSC_SCOPE], deps.env, deps.fetchImpl);
  if (!token.ok) {
    if (token.kind === "not_configured") {
      return { ok: false, state: "not_configured", message: "No Google credential is configured (GOOGLE_SERVICE_ACCOUNT_JSON)." };
    }
    return fail(tokenState(token.kind), token.detail);
  }

  const access = await gscTestAccess(token.token, property.siteUrl, deps.fetchImpl);
  if (!access.ok) return fail(access.state, access.detail);

  const period = defaultGscPeriod(now);
  const base = {
    token: token.token,
    siteUrl: property.siteUrl,
    startDate: period.startDate,
    endDate: period.endDate,
    searchType,
    fetchImpl: deps.fetchImpl,
    rowLimit: deps.rowLimit,
  };
  const totals = await gscQuery({ ...base, dimension: null });
  if (!totals.ok) return fail(totals.state, totals.detail);
  const queries = await gscQuery({ ...base, dimension: "query" });
  if (!queries.ok) return fail(queries.state, queries.detail);
  const pages = await gscQuery({ ...base, dimension: "page" });
  if (!pages.ok) return fail(pages.state, pages.detail);
  // Which page ranks for which query: the basis for "which page to work on".
  const queryPages = await gscQuery({ ...base, dimension: "query_page" });
  if (!queryPages.ok) return fail(queryPages.state, queryPages.detail);

  const periodStart = new Date(`${period.startDate}T00:00:00Z`);
  const periodEnd = new Date(`${period.endDate}T00:00:00Z`);
  const total = totals.data[0] ?? { key: "total", clicks: 0, impressions: 0, position: null };
  const all = [
    { dimension: "total", rows: [total] },
    { dimension: "query", rows: queries.data },
    { dimension: "page", rows: pages.data },
    { dimension: "query_page", rows: queryPages.data },
  ];

  // Replace this exact period atomically: a replay yields the same rows.
  await prisma.$transaction([
    prisma.gscMetric.deleteMany({ where: { propertyId: property.id, periodStart, periodEnd, searchType } }),
    prisma.gscMetric.createMany({
      data: all.flatMap((group) =>
        group.rows.map((r) => ({
          propertyId: property.id,
          dimension: group.dimension,
          key: r.key.slice(0, 1000),
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
          periodStart,
          periodEnd,
          searchType,
          source: "gsc_api",
          syncedAt: now,
        })),
      ),
      skipDuplicates: true,
    }),
    prisma.gscProperty.update({
      where: { id: property.id },
      data: {
        clicks28d: total.clicks,
        impressions28d: total.impressions,
        avgPosition: total.position,
        verified: true,
        propertyType: propertyTypeOf(property.siteUrl),
        dataSource: "live",
        syncState: "ok",
        lastAttemptAt: now,
        lastSyncAt: now,
        lastError: null,
        dataThrough: periodEnd,
        periodStart,
        periodEnd,
        disconnectedAt: null,
      },
    }),
  ]);

  return {
    ok: true,
    state: "ok",
    message: `Synced ${period.startDate} → ${period.endDate}: ${total.clicks} clicks, ${total.impressions} impressions.`,
    rows: queries.data.length + pages.data.length,
    clicks: total.clicks,
    impressions: total.impressions,
    period,
  };
}

/** Stop syncing a property. Historical metrics are retained. */
export async function disconnectGscProperty(propertyId: string): Promise<void> {
  await prisma.gscProperty.update({
    where: { id: propertyId },
    data: { disconnectedAt: new Date(), syncState: "never", lastError: null },
  });
}
