import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { isMonitorDue } from "@/lib/monitoring/fingerprint";
import { runMonitorsBatch } from "@/lib/monitoring/run-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs every enabled monitor that is due (by its cadence), records results, and
 * drives the incident lifecycle. CRON_SECRET-gated (header `x-cron-secret` or
 * `Authorization: Bearer`). Scheduled every 15 minutes by
 * .github/workflows/monitor-cron.yml.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monitors = await prisma.monitor.findMany({
    // The scheduler only ever runs live checks; fixtures are driven by hand.
    where: { enabled: true, isDemo: false, OR: [{ type: { notIn: ["LEAD_ROUTE", "CUSTOM"] } }, { kind: { not: null } }] },
    orderBy: { lastCheckAt: { sort: "asc", nulls: "first" } },
    take: 500,
  });

  const now = new Date();
  // Cap per invocation so the run always finishes inside the function limit;
  // anything left over is still due and runs on the next tick.
  const due = monitors
    .filter((m) => isMonitorDue(m.lastCheckAt, m.cadenceMinutes, now))
    .slice(0, 80);
  const summary = await runMonitorsBatch(due, 8, "scheduler");

  await telemetry.info({
    source: "cron.run-monitors",
    message: `Ran ${summary.checked} due monitors (${summary.opened} opened, ${summary.resolved} resolved)`,
  });

  return NextResponse.json({ success: true, ...summary });
}
