import { NextResponse } from "next/server";
import { telemetry } from "@/lib/telemetry";
import { requireCronSecret } from "@/lib/cron-auth";
import { googleCseProvider } from "@/lib/prospecting/agent";
import { nextDueTarget, runProspectTarget } from "@/lib/prospecting/run-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prospecting agent, scheduled daily: runs the one saved search that has
 * waited longest (each search at most once a week), stores the low-ranking
 * businesses it finds and writes their drafts. It never sends email.
 */
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const provider = googleCseProvider();
  if (!provider) {
    return NextResponse.json({
      success: true,
      ran: false,
      reason: "No search provider is connected (GOOGLE_CSE_KEY and GOOGLE_CSE_CX).",
    });
  }
  const target = await nextDueTarget();
  if (!target) return NextResponse.json({ success: true, ran: false, reason: "No saved search is due." });

  const r = await runProspectTarget(target, { provider, maxNew: 8 });
  await telemetry.info({
    source: "cron.prospect",
    message: `Prospecting "${target.keyword}" in ${target.city}, ${target.state}: ${r.added.length} added, ${r.drafted} drafted (${r.status})`,
  });
  return NextResponse.json({
    success: true,
    ran: true,
    target: `${target.keyword} · ${target.city}, ${target.state}`,
    status: r.status,
    resultsSeen: r.resultsSeen,
    added: r.added.length,
    drafted: r.drafted,
    noEmail: r.noEmail,
    skipped: r.skipped,
    error: r.error,
  });
}
