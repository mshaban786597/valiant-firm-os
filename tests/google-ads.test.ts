import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  googleAdsCampaign: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  integrationVerification: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  CAMPAIGN_QUERY,
  CLIENT_ACCOUNTS_QUERY,
  CUSTOMER_QUERY,
  adsErrorCode,
  classifyAdsFailure,
  formatCustomerId,
  microsToCents,
  parseAccessibleCustomers,
  parseCampaignRows,
  parseClientAccounts,
  parseCustomer,
} from "@/lib/integrations/google-ads";
import { readGoogleAds, summarizeAdsRead, syncGoogleAds } from "@/lib/integrations/google-ads-sync";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "svc@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }),
};

/** The body Google really returned for the cancelled Valiant Firm account (v26). */
const NOT_ENABLED = {
  error: {
    code: 403,
    message: "The caller does not have permission",
    status: "PERMISSION_DENIED",
    details: [
      {
        "@type": "type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure",
        errors: [
          {
            errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
            message: "The customer account can't be accessed because it is not yet enabled or has been deactivated.",
          },
        ],
      },
    ],
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake Google: answers the token call, the account list and each search by account and query. */
function fakeGoogle(routes: { accounts: string[]; search: (customerId: string, query: string, headers: Record<string, string>) => Response }) {
  const calls: { url: string; method: string; body: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? ""), headers });
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: `tok-${calls.length}`, expires_in: 3600 });
    if (url.endsWith("customers:listAccessibleCustomers")) return json({ resourceNames: routes.accounts.map((a) => `customers/${a}`) });
    const m = url.match(/customers\/(\d+)\/googleAds:search$/);
    if (m) return routes.search(m[1]!, (JSON.parse(String(init?.body)) as { query: string }).query, headers);
    return json({}, 404);
  }) as typeof fetch;
  return { impl, calls };
}

beforeEach(() => {
  Object.values(db.googleAdsCampaign).forEach((f) => f.mockReset());
  db.integrationVerification.upsert.mockReset();
});

describe("Google Ads helpers", () => {
  it("formats account numbers the way Google Ads shows them", () => {
    expect(formatCustomerId("3026101423")).toBe("302-610-1423");
    expect(formatCustomerId("123")).toBe("123");
  });

  it("converts cost from millionths to cents", () => {
    expect(microsToCents(12_340_000)).toBe(1234);
    expect(microsToCents(5_000)).toBe(1);
    expect(microsToCents(0)).toBe(0);
  });

  it("reads the account list", () => {
    expect(parseAccessibleCustomers({ resourceNames: ["customers/3026101423", "bad", 7] })).toEqual(["3026101423"]);
    expect(parseAccessibleCustomers(null)).toEqual([]);
  });

  it("reads campaign rows, with numbers sent as strings", () => {
    const rows = parseCampaignRows([
      {
        campaign: { resourceName: "customers/1/campaigns/55", id: "55", name: "Gutters Search", status: "ENABLED" },
        metrics: { costMicros: "45670000", impressions: "1200", clicks: "87", conversions: 6.5 },
      },
      { campaign: { id: "56", status: "PAUSED" }, metrics: {} },
      { metrics: { clicks: "9" } },
    ]);
    expect(rows).toEqual([
      { campaignId: "55", name: "Gutters Search", status: "ENABLED", spendCents: 4567, impressions: 1200, clicks: 87, conversions: 6.5 },
      { campaignId: "56", name: "Campaign 56", status: "PAUSED", spendCents: 0, impressions: 0, clicks: 0, conversions: 0 },
    ]);
  });

  it("reads the account and the accounts under a manager", () => {
    expect(parseCustomer([{ customer: { id: "1", descriptiveName: "Valiant Firm", currencyCode: "USD", manager: false } }])).toEqual({
      id: "1",
      name: "Valiant Firm",
      currency: "USD",
      manager: false,
    });
    expect(parseCustomer([])).toBeNull();
    expect(
      parseClientAccounts([
        { customerClient: { id: "2", descriptiveName: "Client A", manager: false } },
        { customerClient: { id: "3", manager: true } },
      ]),
    ).toEqual([{ id: "2", name: "Client A" }]);
  });

  it("only ever asks to read", () => {
    for (const q of [CUSTOMER_QUERY, CLIENT_ACCOUNTS_QUERY, CAMPAIGN_QUERY]) expect(q.startsWith("SELECT ")).toBe(true);
    expect(CAMPAIGN_QUERY).toContain("DURING LAST_30_DAYS");
  });

  it("names the reason Google gave", () => {
    expect(adsErrorCode(NOT_ENABLED)).toEqual({ kind: "authorizationError", code: "CUSTOMER_NOT_ENABLED" });
    expect(classifyAdsFailure(403, NOT_ENABLED).state).toBe("inactive");
    const code = (kind: string, c: string) => ({ error: { details: [{ errors: [{ errorCode: { [kind]: c } }] }] } });
    expect(classifyAdsFailure(403, code("authorizationError", "USER_PERMISSION_DENIED")).state).toBe("forbidden");
    expect(classifyAdsFailure(403, code("authorizationError", "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION")).state).toBe("not_approved");
    expect(classifyAdsFailure(429, code("quotaError", "RESOURCE_EXHAUSTED")).state).toBe("quota");
    expect(classifyAdsFailure(401, null).state).toBe("needs_reauth");
    expect(classifyAdsFailure(403, null).state).toBe("forbidden");
    expect(classifyAdsFailure(500, null).state).toBe("error");
  });
});

describe("reading Google Ads", () => {
  it("says so when the key is missing, and calls nothing", async () => {
    const g = fakeGoogle({ accounts: [], search: () => json({}) });
    const r = await readGoogleAds({}, g.impl);
    expect(r).toMatchObject({ ok: false, state: "not_configured", accounts: [] });
    expect(g.calls).toHaveLength(0);
  });

  it("reports a cancelled account truthfully, with no campaigns", async () => {
    const g = fakeGoogle({ accounts: ["3026101423"], search: () => json(NOT_ENABLED, 403) });
    const r = await readGoogleAds(env, g.impl);
    expect(r.ok).toBe(false);
    expect(r.state).toBe("inactive");
    expect(r.message).toBe("302-610-1423: This Google Ads account is cancelled or not yet enabled, so Google returns no data for it.");
    expect(r.accounts).toEqual([{ customerId: "3026101423", name: null, state: "inactive", campaigns: [] }]);
  });

  it("says when the service account is on no Ads account", async () => {
    const r = await readGoogleAds(env, fakeGoogle({ accounts: [], search: () => json({}) }).impl);
    expect(r).toMatchObject({ ok: false, state: "no_accounts" });
  });

  it("reads campaigns from an active account, sending only search requests", async () => {
    const g = fakeGoogle({
      accounts: ["1111111111"],
      search: (_id, query) =>
        query === CUSTOMER_QUERY
          ? json({ results: [{ customer: { id: "1111111111", descriptiveName: "Valiant Firm", currencyCode: "USD", manager: false } }] })
          : json({ results: [{ campaign: { id: "55", name: "Brand", status: "ENABLED" }, metrics: { costMicros: "2500000", clicks: "10", impressions: "100", conversions: 2 } }] }),
    });
    const r = await readGoogleAds(env, g.impl);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Read 1 campaign for the last 30 days from Valiant Firm (111-111-1111).");
    expect(r.accounts[0]!.campaigns[0]).toMatchObject({ campaignId: "55", spendCents: 250, clicks: 10 });
    const adsCalls = g.calls.filter((c) => c.url.includes("googleads.googleapis.com"));
    expect(adsCalls.every((c) => c.url.endsWith(":listAccessibleCustomers") || c.url.endsWith("googleAds:search"))).toBe(true);
    expect(adsCalls.some((c) => /mutate/i.test(c.url) || /mutate/i.test(c.body))).toBe(false);
  });

  it("reads the accounts under a manager account through that manager", async () => {
    const g = fakeGoogle({
      accounts: ["9000000000"],
      search: (id, query, headers) => {
        if (query === CUSTOMER_QUERY) return json({ results: [{ customer: { id, descriptiveName: "Agency", manager: true } }] });
        if (query === CLIENT_ACCOUNTS_QUERY) return json({ results: [{ customerClient: { id: "2000000000", descriptiveName: "Client A", manager: false } }] });
        expect(headers["login-customer-id"]).toBe("9000000000");
        return json({ results: [{ campaign: { id: "7", name: "A1", status: "ENABLED" }, metrics: { costMicros: "1000000" } }] });
      },
    });
    const r = await readGoogleAds(env, g.impl);
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0]).toMatchObject({ customerId: "2000000000", name: "Client A", state: "ok" });
  });

  it("keeps the good accounts and names the bad one", () => {
    const s = summarizeAdsRead([
      { customerId: "1111111111", name: "A", state: "ok", campaigns: [] },
      { customerId: "3026101423", name: null, state: "inactive", campaigns: [] },
    ]);
    expect(s.ok).toBe(true);
    expect(s.message).toContain("Read 0 campaigns for the last 30 days from A (111-111-1111).");
    expect(s.message).toContain("302-610-1423: This Google Ads account is cancelled");
  });
});

describe("syncing Google Ads", () => {
  const active = () =>
    fakeGoogle({
      accounts: ["1111111111"],
      search: (_id, query) =>
        query === CUSTOMER_QUERY
          ? json({ results: [{ customer: { id: "1111111111", descriptiveName: "Valiant Firm", manager: false } }] })
          : json({
              results: [
                { campaign: { id: "55", name: "Brand", status: "ENABLED" }, metrics: { costMicros: "9000000", clicks: "30", impressions: "400", conversions: 2.6 } },
                { campaign: { id: "66", name: "Other org", status: "ENABLED" }, metrics: { costMicros: "1000000" } },
                { campaign: { id: "77", name: "New", status: "PAUSED" }, metrics: {} },
              ],
            }),
    });

  it("saves real figures, keeps the client link, and never writes into another organization's row", async () => {
    db.googleAdsCampaign.findUnique.mockImplementation(async ({ where }: { where: { campaignId: string } }) =>
      where.campaignId === "55" ? { id: "row-55", organizationId: "org-1" } : where.campaignId === "66" ? { id: "row-66", organizationId: "org-2" } : null,
    );
    const r = await syncGoogleAds("org-1", env, active().impl);

    expect(r.ok).toBe(true);
    expect(r.saved).toBe(2);
    const update = db.googleAdsCampaign.update.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
    expect(update.where).toEqual({ id: "row-55" });
    expect(update.data).toMatchObject({ campaignName: "Brand", spend: 900, clicks: 30, impressions: 400, conversions: 3, costPerConv: 300 });
    expect(update.data).not.toHaveProperty("clientId");
    expect(db.googleAdsCampaign.update).toHaveBeenCalledTimes(1);
    const create = db.googleAdsCampaign.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(create.data).toMatchObject({ organizationId: "org-1", campaignId: "77", status: "PAUSED", spend: 0, conversions: 0, costPerConv: null });
    expect(db.googleAdsCampaign.create).toHaveBeenCalledTimes(1);
  });

  it("stores no campaign and records the reason when the account is cancelled", async () => {
    const g = fakeGoogle({ accounts: ["3026101423"], search: () => json(NOT_ENABLED, 403) });
    const r = await syncGoogleAds("org-1", env, g.impl);
    expect(r).toMatchObject({ ok: false, state: "inactive", saved: 0 });
    expect(db.googleAdsCampaign.create).not.toHaveBeenCalled();
    expect(db.googleAdsCampaign.update).not.toHaveBeenCalled();
    const saved = db.integrationVerification.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(saved.create).toMatchObject({ integrationId: "google-ads", lastTestOk: false, lastLiveVerifiedAt: null });
    expect(String(saved.create.lastTestDetail)).toContain("302-610-1423");
  });
});
