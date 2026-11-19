import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import { siteDomain } from "@/lib/clients/link-site";
import {
  GBP_SCOPE,
  GBP_STATE_COPY,
  defaultGbpPeriod,
  gbpAcceptInvitation,
  gbpDailyMetrics,
  gbpListAccounts,
  gbpListInvitations,
  gbpListLocations,
  gbpReviewSummary,
  sumDays,
  type GbpSyncState,
} from "@/lib/integrations/gbp";

type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export interface GbpOpResult {
  ok: boolean;
  state: GbpSyncState | "not_configured";
  message: string;
}

async function tokenFor(deps: { env?: Env; fetchImpl?: FetchLike }): Promise<{ ok: true; token: string } | { ok: false; result: GbpOpResult }> {
  const t = await getGoogleAccessToken([GBP_SCOPE], deps.env, deps.fetchImpl);
  if (t.ok) return { ok: true, token: t.token };
  return {
    ok: false,
    result:
      t.kind === "not_configured"
        ? { ok: false, state: "not_configured", message: "No Google credential is configured (GOOGLE_SERVICE_ACCOUNT_JSON)." }
        : { ok: false, state: "needs_reauth", message: `${GBP_STATE_COPY.needs_reauth} (${t.detail})` },
  };
}

/**
 * Find every Business Profile the credential manages and register it.
 * Invitations waiting for the credential are accepted first (that is how a
 * profile owner's "add manager" reaches a service account). A profile is
 * linked to a client when its website is one of that client's websites.
 * Nothing is removed, and manually added profiles are left alone.
 */
export async function discoverGbpLocations(
  organizationId: string,
  deps: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<GbpOpResult & { found: number; added: number; linked: number; invitationsAccepted: number }> {
  const none = { found: 0, added: 0, linked: 0, invitationsAccepted: 0 };
  const t = await tokenFor(deps);
  if (!t.ok) return { ...t.result, ...none };

  const accounts = await gbpListAccounts(t.token, deps.fetchImpl);
  if (!accounts.ok) return { ok: false, state: accounts.state, message: `${GBP_STATE_COPY[accounts.state]} (${accounts.detail})`, ...none };

  let invitationsAccepted = 0;
  for (const a of accounts.data) {
    const inv = await gbpListInvitations(t.token, a.name, deps.fetchImpl);
    if (!inv.ok) continue;
    for (const name of inv.data) {
      const accepted = await gbpAcceptInvitation(t.token, name, deps.fetchImpl);
      if (accepted.ok) invitationsAccepted += 1;
    }
  }
  // Accepting can add accounts (location groups) the credential did not have before.
  const all = invitationsAccepted ? await gbpListAccounts(t.token, deps.fetchImpl) : accounts;
  const accountList = all.ok ? all.data : accounts.data;

  const sites = await prisma.site.findMany({ where: { organizationId, kind: "client", clientId: { not: null } }, select: { domain: true, clientId: true } });
  const clients = await prisma.client.findMany({ where: { organizationId, isDemo: false }, select: { id: true, websiteUrl: true } });
  const clientForDomain = (domain: string | null): string | null => {
    if (!domain) return null;
    const viaSite = sites.filter((s) => s.domain === domain)[0];
    if (viaSite?.clientId) return viaSite.clientId;
    return clients.filter((c) => siteDomain(c.websiteUrl) === domain)[0]?.id ?? null;
  };

  let found = 0;
  let added = 0;
  let linked = 0;
  for (const a of accountList) {
    const list = await gbpListLocations(t.token, a.name, deps.fetchImpl);
    if (!list.ok) {
      if (found === 0 && a === accountList[accountList.length - 1]) {
        return { ok: false, state: list.state, message: `${GBP_STATE_COPY[list.state]} (${list.detail})`, ...none, invitationsAccepted };
      }
      continue;
    }
    for (const l of list.data) {
      found += 1;
      const clientId = clientForDomain(siteDomain(l.website));
      const data = {
        businessName: l.title,
        category: l.category,
        phone: l.phone,
        website: l.website,
        address: l.address,
        mapsUri: l.mapsUri,
        placeId: l.placeId,
        missing: l.missing,
        accountName: a.name,
        dataSource: "live",
      };
      const existing = await prisma.gbpLocation.findUnique({ where: { gbpId: l.locationId }, select: { id: true, organizationId: true, clientId: true } });
      if (existing) {
        if (existing.organizationId !== organizationId) continue;
        await prisma.gbpLocation.update({ where: { id: existing.id }, data: { ...data, clientId: existing.clientId ?? clientId } });
        if (existing.clientId ?? clientId) linked += 1;
      } else {
        await prisma.gbpLocation.create({ data: { organizationId, gbpId: l.locationId, clientId, ...data } });
        added += 1;
        if (clientId) linked += 1;
      }
    }
  }
  return {
    ok: true,
    state: "ok",
    message:
      found === 0
        ? "Connected, but this credential manages no Business Profile yet. Add the service-account email as a Manager on each profile, then try again."
        : `${found} profile${found === 1 ? "" : "s"} found, ${added} new, ${linked} linked to a client${invitationsAccepted ? `, ${invitationsAccepted} invitation${invitationsAccepted === 1 ? "" : "s"} accepted` : ""}.`,
    found,
    added,
    linked,
    invitationsAccepted,
  };
}

/**
 * Pull the last 28 days of profile activity (views on Search and Maps, calls,
 * website clicks, direction requests) and the review rating. If the activity
 * read fails, nothing stored is changed. Reviews come from a separate Google
 * API: if only that part fails, activity is still saved and the rating is left
 * as it was, with the reason recorded.
 */
export async function syncGbpLocation(
  location: { id: string; gbpId: string; accountName: string | null },
  deps: { env?: Env; fetchImpl?: FetchLike; now?: Date } = {},
): Promise<GbpOpResult> {
  const now = deps.now ?? new Date();
  const fail = async (state: GbpSyncState, detail: string): Promise<GbpOpResult> => {
    await prisma.gbpLocation.update({ where: { id: location.id }, data: { lastAttemptAt: now, syncState: state, lastError: detail } });
    return { ok: false, state, message: `${GBP_STATE_COPY[state]} (${detail})` };
  };
  if (!/^locations\/[\w-]+$/.test(location.gbpId)) {
    return { ok: false, state: "error", message: "This profile was added by hand and has no Google location ID, so it cannot be synced. Use Find profiles." };
  }
  const t = await tokenFor(deps);
  if (!t.ok) return t.result.state === "not_configured" ? t.result : fail("needs_reauth", t.result.message);

  const period = defaultGbpPeriod(now);
  const days = await gbpDailyMetrics(t.token, location.gbpId, period.start, period.end, deps.fetchImpl);
  if (!days.ok) return fail(days.state, days.detail);
  const totals = sumDays(days.data);

  const reviews = location.accountName ? await gbpReviewSummary(t.token, location.accountName, location.gbpId, deps.fetchImpl) : null;

  await prisma.$transaction([
    prisma.gbpMetricDay.deleteMany({ where: { gbpLocationId: location.id, date: { gte: period.start, lte: period.end } } }),
    prisma.gbpMetricDay.createMany({
      data: days.data.map((d) => ({
        gbpLocationId: location.id,
        date: new Date(`${d.date}T00:00:00Z`),
        searchViews: d.searchViews,
        mapsViews: d.mapsViews,
        calls: d.calls,
        websiteClicks: d.websiteClicks,
        directions: d.directions,
      })),
      skipDuplicates: true,
    }),
    prisma.gbpLocation.update({
      where: { id: location.id },
      data: {
        syncState: "ok",
        lastError: null,
        lastAttemptAt: now,
        lastSyncAt: now,
        periodStart: period.start,
        periodEnd: period.end,
        searchViews28d: totals.searchViews,
        mapsViews28d: totals.mapsViews,
        calls28d: totals.calls,
        websiteClicks28d: totals.websiteClicks,
        directions28d: totals.directions,
        ...(reviews?.ok
          ? { rating: reviews.data.rating, reviewCount: reviews.data.reviewCount, reviewsState: "ok" }
          : { reviewsState: reviews ? `unavailable: ${reviews.detail}`.slice(0, 200) : "unavailable: account not known" }),
      },
    }),
  ]);
  return {
    ok: true,
    state: "ok",
    message:
      `Synced ${period.startDate} to ${period.endDate}: ${totals.searchViews + totals.mapsViews} views, ${totals.calls} calls, ${totals.websiteClicks} website clicks.` +
      (reviews?.ok ? "" : " Reviews could not be read; the rating was left as it was."),
  };
}
