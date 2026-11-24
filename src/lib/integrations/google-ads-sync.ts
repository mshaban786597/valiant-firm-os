import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import {
  ADS_STATE_COPY,
  CAMPAIGN_QUERY,
  CLIENT_ACCOUNTS_QUERY,
  CUSTOMER_QUERY,
  GOOGLE_ADS_SCOPE,
  adsSearch,
  formatCustomerId,
  listAccessibleCustomers,
  parseCampaignRows,
  parseClientAccounts,
  parseCustomer,
  type AdsCampaignRow,
  type AdsState,
} from "@/lib/integrations/google-ads";

type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export const GOOGLE_ADS_ID = "google-ads";

/** One Ads account the service account can reach, and what Google said about it. */
export interface AdsAccountReport {
  customerId: string;
  name: string | null;
  state: AdsState;
  campaigns: AdsCampaignRow[];
}

export interface AdsReadResult {
  ok: boolean;
  state: AdsState | "not_configured" | "no_accounts";
  message: string;
  accounts: AdsAccountReport[];
}

const label = (a: { customerId: string; name: string | null }) =>
  a.name ? `${a.name} (${formatCustomerId(a.customerId)})` : formatCustomerId(a.customerId);

/** Plain-language summary of a read, used for the connection test and the sync. */
export function summarizeAdsRead(accounts: AdsAccountReport[]): { ok: boolean; state: AdsReadResult["state"]; message: string } {
  if (accounts.length === 0) {
    return {
      ok: false,
      state: "no_accounts",
      message: "Google accepted the credential, but the service account has not been added to any Google Ads account.",
    };
  }
  const good = accounts.filter((a) => a.state === "ok");
  const bad = accounts.filter((a) => a.state !== "ok");
  const problems = bad.map((a) => `${label(a)}: ${ADS_STATE_COPY[a.state]}`).join(" ");
  if (good.length === 0) return { ok: false, state: bad[0]!.state, message: problems };
  const total = good.reduce((n, a) => n + a.campaigns.length, 0);
  const head = `Read ${total} campaign${total === 1 ? "" : "s"} for the last 30 days from ${good.map(label).join(", ")}.`;
  return { ok: true, state: "ok", message: problems ? `${head} ${problems}` : head };
}

/**
 * Ask Google which Ads accounts the service account can read and pull each
 * one's campaign totals. Reads only; writes nothing.
 */
export async function readGoogleAds(env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<AdsReadResult> {
  const t = await getGoogleAccessToken([GOOGLE_ADS_SCOPE], env, fetchImpl);
  if (!t.ok) {
    const state = t.kind === "not_configured" ? "not_configured" : t.kind === "error" ? "error" : "needs_reauth";
    return { ok: false, state, message: t.detail, accounts: [] };
  }
  const list = await listAccessibleCustomers(t.token, fetchImpl);
  if (!list.ok) return { ok: false, state: list.state, message: ADS_STATE_COPY[list.state], accounts: [] };

  const accounts: AdsAccountReport[] = [];
  const campaignsFor = async (customerId: string, name: string | null, loginCustomerId?: string) => {
    const rows = await adsSearch(t.token, customerId, CAMPAIGN_QUERY, { loginCustomerId, fetchImpl });
    accounts.push(
      rows.ok
        ? { customerId, name, state: "ok", campaigns: parseCampaignRows(rows.value) }
        : { customerId, name, state: rows.state, campaigns: [] },
    );
  };

  for (const id of list.value) {
    const info = await adsSearch(t.token, id, CUSTOMER_QUERY, { fetchImpl });
    if (!info.ok) {
      accounts.push({ customerId: id, name: null, state: info.state, campaigns: [] });
      continue;
    }
    const customer = parseCustomer(info.value);
    if (!customer?.manager) {
      await campaignsFor(id, customer?.name ?? null);
      continue;
    }
    // A manager account holds no campaigns itself: read the accounts under it.
    const clients = await adsSearch(t.token, id, CLIENT_ACCOUNTS_QUERY, { loginCustomerId: id, fetchImpl });
    if (!clients.ok) {
      accounts.push({ customerId: id, name: customer.name, state: clients.state, campaigns: [] });
      continue;
    }
    for (const c of parseClientAccounts(clients.value)) await campaignsFor(c.id, c.name, id);
  }
  return { ...summarizeAdsRead(accounts), accounts };
}

export interface AdsSyncResult extends AdsReadResult {
  saved: number;
}

/**
 * Pull campaign totals from Google Ads and store them. A campaign's client
 * link is kept as it was set in the app; nothing is ever removed here.
 */
export async function syncGoogleAds(
  organizationId: string,
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<AdsSyncResult> {
  const read = await readGoogleAds(env, fetchImpl);
  const now = new Date();
  let saved = 0;

  for (const account of read.accounts) {
    for (const c of account.campaigns) {
      const conversions = Math.round(c.conversions);
      const figures = {
        campaignName: c.name,
        status: c.status,
        spend: c.spendCents,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions,
        costPerConv: conversions > 0 ? Math.round(c.spendCents / conversions) : null,
        lastSyncAt: now,
      };
      const existing = await prisma.googleAdsCampaign.findUnique({
        where: { campaignId: c.campaignId },
        select: { id: true, organizationId: true },
      });
      // Campaign ids are global: never write into a row that belongs to another organization.
      if (existing && existing.organizationId !== organizationId) continue;
      if (existing) await prisma.googleAdsCampaign.update({ where: { id: existing.id }, data: figures });
      else await prisma.googleAdsCampaign.create({ data: { organizationId, campaignId: c.campaignId, ...figures } });
      saved += 1;
    }
  }

  await prisma.integrationVerification.upsert({
    where: { organizationId_integrationId: { organizationId, integrationId: GOOGLE_ADS_ID } },
    create: {
      organizationId,
      integrationId: GOOGLE_ADS_ID,
      lastTestAt: now,
      lastTestOk: read.ok,
      lastTestDetail: read.message,
      lastLiveVerifiedAt: read.ok ? now : null,
    },
    update: { lastTestAt: now, lastTestOk: read.ok, lastTestDetail: read.message, ...(read.ok ? { lastLiveVerifiedAt: now } : {}) },
  });

  return { ...read, saved };
}
