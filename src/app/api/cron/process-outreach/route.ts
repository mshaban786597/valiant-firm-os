import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { notify } from "@/lib/notifications/dispatch";
import { processDueSends, reconcileSends } from "@/lib/outreach/engine";
import { outreachRunAlerts } from "@/lib/outreach/run-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send approved outreach emails that are due (live scope only) and reconcile
 * any send left unclear by a restart. CRON_SECRET-gated.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgs = await prisma.outreachSend.findMany({
    where: { isDemo: false, status: { in: ["scheduled", "sending", "needs_reconcile"] } },
    select: { organizationId: true },
    distinct: ["organizationId"],
    take: 50,
  });

  const totals = { due: 0, sent: 0, canceled: 0, failed: 0, needsReconcile: 0, skippedNoProvider: 0, heldDailyLimit: 0, reconciled: 0 };
  for (const { organizationId } of orgs) {
    const rec = await reconcileSends({ organizationId, isDemo: false });
    const run = await processDueSends({ organizationId, isDemo: false });
    totals.reconciled += rec.reconciled;
    totals.due += run.due;
    totals.sent += run.sent;
    totals.canceled += run.canceled;
    totals.failed += run.failed;
    totals.needsReconcile += run.needsReconcile + rec.stillAmbiguous;
    totals.skippedNoProvider += run.skippedNoProvider;
    totals.heldDailyLimit += run.heldDailyLimit;

    for (const alert of outreachRunAlerts(run, rec.stillAmbiguous)) {
      await notify({ organizationId, ...alert, path: "/outreach" });
    }
  }

  await telemetry.info({
    source: "cron.process-outreach",
    message: `Outreach: ${totals.sent} sent, ${totals.canceled} canceled, ${totals.heldDailyLimit} held for the daily allowance, ${totals.needsReconcile} need reconcile`,
  });
  return NextResponse.json({ success: true, ...totals });
}
