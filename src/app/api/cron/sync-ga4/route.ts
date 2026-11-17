import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { requireCronSecret } from "@/lib/cron-auth";
import { syncGa4Property } from "@/lib/integrations/ga4-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily Google Analytics refresh. Syncs the properties that have gone longest
 * without an attempt (a few per call, to stay inside the time limit). A failed
 * sync keeps the previous numbers; it never writes zeros.
 */
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const stale = new Date(Date.now() - 20 * 3_600_000);
  const properties = await prisma.ga4Property.findMany({
    where: { OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: stale } }] },
    orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }],
    select: { id: true, organizationId: true, propertyId: true, displayName: true },
    take: 5,
  });

  const results: { property: string; ok: boolean; state: string }[] = [];
  const started = Date.now();
  for (const p of properties) {
    if (Date.now() - started > 45_000) break;
    const r = await syncGa4Property(p).catch(() => ({ ok: false, state: "error", message: "sync failed" }));
    results.push({ property: p.displayName, ok: r.ok, state: r.state });
  }

  await telemetry.info({
    source: "cron.sync-ga4",
    message: `Google Analytics: ${results.filter((r) => r.ok).length}/${results.length} properties synced`,
  });
  return NextResponse.json({ success: true, attempted: results.length, results });
}
