import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { notify } from "@/lib/notifications/dispatch";
import { countsLine } from "@/lib/email/campaign";
import { processCampaign } from "@/lib/email/campaign-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Continue email campaigns that are being sent: the next batch of each, within
 * the daily limit. CRON_SECRET-gated.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaigns = await prisma.emailCampaign.findMany({
    where: { status: "sending" },
    orderBy: { updatedAt: "asc" },
    take: 3, // each batch takes up to ~20 seconds
    select: { id: true, organizationId: true, name: true },
  });

  const totals = { campaigns: campaigns.length, sent: 0, refused: 0, skipped: 0, finished: 0, remaining: 0 };
  let note: string | null = null;
  for (const c of campaigns) {
    const run = await processCampaign({ organizationId: c.organizationId, campaignId: c.id });
    if (!run) continue;
    if (run.off) note = run.off;
    totals.sent += run.sent;
    totals.refused += run.refused;
    totals.skipped += run.skipped;
    totals.remaining += run.remaining;
    if (run.finished) {
      totals.finished++;
      await notify({
        organizationId: c.organizationId,
        event: "campaign_sent",
        title: `${c.name}: ${countsLine(run.counts)}`,
        path: "/email-campaigns",
      });
    }
  }

  if (totals.sent + totals.refused + totals.skipped > 0) {
    await telemetry.info({
      source: "cron.send-campaigns",
      message: `Email campaigns: ${totals.sent} sent, ${totals.refused} refused, ${totals.skipped} skipped, ${totals.remaining} waiting`,
    });
  }
  return NextResponse.json({ success: true, ...totals, ...(note ? { note } : {}) });
}
