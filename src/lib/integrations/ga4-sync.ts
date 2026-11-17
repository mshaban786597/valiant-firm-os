import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import {
  GA4_SCOPE,
  GA4_STATE_COPY,
  defaultGa4Periods,
  engagementRate,
  ga4Date,
  ga4ListProperties,
  ga4RunReport,
  ga4WebsiteUrl,
  toTotals,
  type Ga4ReportRow,
  type Ga4SyncState,
} from "@/lib/integrations/ga4";

type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export interface Ga4OpResult {
  ok: boolean;
  state: Ga4SyncState | "not_configured";
  message: string;
}

const domainOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * Find every Analytics property the credential can read and register it.
 * A property is linked to a client when their website domains match.
 * Existing properties keep their data; nothing is removed.
 */
export async function discoverGa4Properties(
  organizationId: string,
  deps: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<Ga4OpResult & { found: number; added: number; linked: number }> {
  const none = { found: 0, added: 0, linked: 0 };
  const token = await getGoogleAccessToken([GA4_SCOPE], deps.env, deps.fetchImpl);
  if (!token.ok) {
    return token.kind === "not_configured"
      ? { ok: false, state: "not_configured", message: "No Google credential is configured (GOOGLE_SERVICE_ACCOUNT_JSON).", ...none }
      : { ok: false, state: "needs_reauth", message: GA4_STATE_COPY.needs_reauth, ...none };
  }
  const list = await ga4ListProperties(token.token, deps.fetchImpl);
  if (!list.ok) return { ok: false, state: list.state, message: `${GA4_STATE_COPY[list.state]} (${list.detail})`, ...none };

  const clients = await prisma.client.findMany({
    where: { organizationId, isDemo: false },
    select: { id: true, websiteUrl: true },
  });
  let added = 0;
  let linked = 0;
  for (const p of list.data) {
    const websiteUrl = await ga4WebsiteUrl(token.token, p.propertyId, deps.fetchImpl);
    const domain = domainOf(websiteUrl);
    const client = domain ? clients.filter((c) => domainOf(c.websiteUrl) === domain)[0] : undefined;
    const existing = await prisma.ga4Property.findUnique({
      where: { organizationId_propertyId: { organizationId, propertyId: p.propertyId } },
      select: { id: true, clientId: true },
    });
    if (existing) {
      await prisma.ga4Property.update({
        where: { id: existing.id },
        data: {
          displayName: p.displayName,
          accountName: p.accountName,
          websiteUrl: websiteUrl ?? undefined,
          clientId: existing.clientId ?? client?.id ?? null,
        },
      });
    } else {
      await prisma.ga4Property.create({
        data: {
          organizationId,
          propertyId: p.propertyId,
          displayName: p.displayName,
          accountName: p.accountName,
          websiteUrl,
          clientId: client?.id ?? null,
        },
      });
      added += 1;
    }
    if (client) {
      linked += 1;
      await prisma.client.update({ where: { id: client.id }, data: { ga4PropertyId: p.propertyId } });
    }
  }
  return {
    ok: true,
    state: "ok",
    message: `${list.data.length} propert${list.data.length === 1 ? "y" : "ies"} readable, ${added} new, ${linked} linked to a client.`,
    found: list.data.length,
    added,
    linked,
  };
}

/**
 * Pull the last 28 complete days for one property: totals (and the 28 days
 * before, for comparison), each day, channels, sources, landing pages and
 * devices. Everything is fetched first and stored together, so a failure part
 * way through leaves the previous numbers untouched. Zeros are never written
 * in place of a failed read.
 */
export async function syncGa4Property(
  property: { id: string; organizationId: string; propertyId: string },
  deps: { env?: Env; fetchImpl?: FetchLike; now?: Date } = {},
): Promise<Ga4OpResult> {
  const now = deps.now ?? new Date();
  const fail = async (state: Ga4SyncState, detail: string): Promise<Ga4OpResult> => {
    await prisma.ga4Property.update({
      where: { id: property.id },
      data: { lastAttemptAt: now, syncState: state, lastError: detail },
    });
    return { ok: false, state, message: `${GA4_STATE_COPY[state]} (${detail})` };
  };

  const token = await getGoogleAccessToken([GA4_SCOPE], deps.env, deps.fetchImpl);
  if (!token.ok) {
    if (token.kind === "not_configured") {
      return { ok: false, state: "not_configured", message: "No Google credential is configured (GOOGLE_SERVICE_ACCOUNT_JSON)." };
    }
    return fail("needs_reauth", token.detail);
  }

  const { current, previous } = defaultGa4Periods(now);
  const run = (range: { startDate: string; endDate: string }, dimension?: string, limit?: number) =>
    ga4RunReport(token.token, property.propertyId, { ...range, dimension, limit }, deps.fetchImpl);

  const totalsNow = await run(current);
  if (!totalsNow.ok) return fail(totalsNow.state, totalsNow.detail);
  const totalsPrev = await run(previous);
  if (!totalsPrev.ok) return fail(totalsPrev.state, totalsPrev.detail);

  const breakdowns: [string, string, number][] = [
    ["date", "date", 40],
    ["channel", "sessionDefaultChannelGroup", 20],
    ["source", "sessionSourceMedium", 25],
    ["landing_page", "landingPagePlusQueryString", 25],
    ["device", "deviceCategory", 5],
  ];
  const collected: { dimension: string; rows: Ga4ReportRow[] }[] = [];
  for (const [dimension, apiName, limit] of breakdowns) {
    const r = await run(current, apiName, limit);
    if (!r.ok) return fail(r.state, r.detail);
    collected.push({ dimension, rows: r.data });
  }

  const t = toTotals(totalsNow.data[0]?.values ?? []);
  const prev = totalsPrev.data[0] ? toTotals(totalsPrev.data[0].values) : null;
  const periodStart = new Date(`${current.startDate}T00:00:00Z`);
  const periodEnd = new Date(`${current.endDate}T00:00:00Z`);

  await prisma.$transaction([
    prisma.ga4Metric.deleteMany({ where: { ga4PropertyId: property.id, periodStart, periodEnd } }),
    prisma.ga4Metric.createMany({
      data: collected.flatMap((c) =>
        c.rows.map((row) => {
          const v = toTotals(row.values);
          return {
            organizationId: property.organizationId,
            ga4PropertyId: property.id,
            dimension: c.dimension,
            key: (c.dimension === "date" ? ga4Date(row.dims[0] ?? "") : row.dims[0] || "(not set)").slice(0, 500),
            sessions: v.sessions,
            users: v.users,
            keyEvents: v.keyEvents,
            engagedSessions: v.engagedSessions,
            views: v.views,
            periodStart,
            periodEnd,
          };
        }),
      ),
      skipDuplicates: true,
    }),
    prisma.ga4Property.update({
      where: { id: property.id },
      data: {
        syncState: "ok",
        lastError: null,
        lastAttemptAt: now,
        lastSyncAt: now,
        periodStart,
        periodEnd,
        sessions28d: t.sessions,
        users28d: t.users,
        newUsers28d: t.newUsers,
        keyEvents28d: t.keyEvents,
        views28d: t.views,
        engagementRate: engagementRate(t),
        avgEngagementSec: t.users > 0 ? t.engagementSeconds / t.users : null,
        prevSessions28d: prev ? prev.sessions : null,
        prevUsers28d: prev ? prev.users : null,
        prevKeyEvents28d: prev ? prev.keyEvents : null,
      },
    }),
  ]);
  return {
    ok: true,
    state: "ok",
    message: `Synced ${current.startDate} to ${current.endDate}: ${t.sessions} sessions, ${t.users} users, ${t.keyEvents} key events.`,
  };
}
