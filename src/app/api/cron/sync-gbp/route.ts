import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { requireCronSecret } from "@/lib/cron-auth";
import { syncGbpLocation } from "@/lib/integrations/gbp-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily Business Profile refresh for live profiles, oldest attempt first, a
 * few per call. A failed sync keeps the previous numbers; it never writes zeros.
 */
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const stale = new Date(Date.now() - 20 * 3_600_000);
  const locations = await prisma.gbpLocation.findMany({
    where: { dataSource: "live", OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: stale } }] },
    orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }],
    select: { id: true, gbpId: true, accountName: true, businessName: true },
    take: 5,
  });

  const results: { profile: string; ok: boolean; state: string }[] = [];
  const started = Date.now();
  for (const l of locations) {
    if (Date.now() - started > 45_000) break;
    const r = await syncGbpLocation(l).catch(() => ({ ok: false, state: "error", message: "sync failed" }));
    results.push({ profile: l.businessName, ok: r.ok, state: r.state });
  }
  await telemetry.info({
    source: "cron.sync-gbp",
    message: `Business Profile: ${results.filter((r) => r.ok).length}/${results.length} profiles synced`,
  });
  return NextResponse.json({ success: true, attempted: results.length, results });
}
