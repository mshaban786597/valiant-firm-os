import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { requireCronSecret } from "@/lib/cron-auth";
import { syncGscProperty } from "@/lib/integrations/gsc-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily Search Console refresh. Syncs the connected properties that have gone
 * longest without an attempt (a few per call, to stay inside the time limit).
 * A failed sync keeps the previous numbers; it never writes zeros.
 */
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const stale = new Date(Date.now() - 20 * 3_600_000);
  const properties = await prisma.gscProperty.findMany({
    where: { dataSource: "live", OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: stale } }] },
    orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }],
    select: { id: true, siteUrl: true, searchType: true },
    take: 4,
  });

  const results: { site: string; ok: boolean; state: string }[] = [];
  const started = Date.now();
  for (const p of properties) {
    if (Date.now() - started > 45_000) break;
    const r = await syncGscProperty(p).catch((e: unknown) => ({
      ok: false,
      state: "error",
      message: e instanceof Error ? e.message : "sync failed",
    }));
    results.push({ site: p.siteUrl, ok: r.ok, state: r.state });
  }

  await telemetry.info({
    source: "cron.sync-gsc",
    message: `Search Console: ${results.filter((r) => r.ok).length}/${results.length} properties synced`,
  });
  return NextResponse.json({ success: true, attempted: results.length, results });
}
