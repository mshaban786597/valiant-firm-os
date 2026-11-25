import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { writeAuditLog } from "@/lib/audit";
import { syncGoogleAds } from "@/lib/integrations/google-ads-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pull the last 30 days of campaign totals from every Ads account the service account can read. */
export async function POST() {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const r = await syncGoogleAds(org.organizationId);
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "google_ads.sync",
    entity: "GoogleAdsCampaign",
    meta: {
      ok: r.ok,
      state: r.state,
      saved: r.saved,
      accounts: r.accounts.map((a) => ({ customerId: a.customerId, state: a.state, campaigns: a.campaigns.length })),
    },
  });
  return r.ok
    ? NextResponse.json({ ok: true, message: r.message, saved: r.saved })
    : NextResponse.json({ error: r.message, state: r.state }, { status: r.state === "not_configured" ? 409 : 502 });
}
