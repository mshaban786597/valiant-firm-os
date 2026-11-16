import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { isMonitorDue } from "@/lib/monitoring/fingerprint";
import { runMonitorCheck } from "@/lib/monitoring/runner";
import { recordCheckResult } from "@/lib/monitoring/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs every enabled monitor that is due (by its cadence), records results, and
 * drives the incident lifecycle. CRON_SECRET-gated (header `x-cron-secret` or
 * `Authorization: Bearer`). Schedule externally, e.g. every 5 minutes.
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
    where: { enabled: true },
    take: 500,
  });

  const now = new Date();
  const due = monitors.filter((m) => isMonitorDue(m.lastCheckAt, m.cadenceMinutes, now));

  let opened = 0;
  let resolved = 0;
  for (const monitor of due) {
    try {
      const result = await runMonitorCheck(monitor);
      const outcome = await recordCheckResult(monitor, result);
      if (outcome.action === "incident_opened") opened++;
      if (outcome.action === "incident_resolved") resolved++;
    } catch {
      // keep going; one monitor failing never blocks the rest
    }
  }

  await telemetry.info({
    source: "cron.run-monitors",
    message: `Ran ${due.length} due monitors (${opened} opened, ${resolved} resolved)`,
  });

  return NextResponse.json({ ok: true, checked: due.length, opened, resolved });
}
