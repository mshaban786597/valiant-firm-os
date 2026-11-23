import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { monitorRunSchema } from "@/lib/schemas/monitoring";
import { runMonitorCheck } from "@/lib/monitoring/runner";
import { recordCheckResult, type CheckResult, type CheckTrigger } from "@/lib/monitoring/incidents";
import { isMonitorDue } from "@/lib/monitoring/fingerprint";
import { describeOutcome } from "@/lib/monitoring/state";

export const runtime = "nodejs";

/**
 * Run a monitor's check now and drive the incident lifecycle.
 *
 * A forced result ({ simulate: "fail" | "ok" }) is only accepted on fixture
 * (fixture) monitors, so simulated outages can never touch live incidents,
 * tasks or alerts. A re-run inside the check window is recorded as a retry.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("monitor.write");
  if (!org.ok) return org.response;

  const monitor = await prisma.monitor.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!monitor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => ({}));
  const parsed = monitorRunSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let result: CheckResult;
  let trigger: CheckTrigger;
  if (parsed.data.simulate) {
    if (!monitor.isDemo) {
      return NextResponse.json(
        { error: "Simulated results are only allowed on fixture checks." },
        { status: 403 },
      );
    }
    trigger = "simulated";
    result = {
      status: parsed.data.simulate,
      detail: parsed.data.detail ?? `Simulated ${parsed.data.simulate}`,
      affectedObject: monitor.target,
      checkKind: monitor.type.toLowerCase(),
    };
  } else {
    trigger = isMonitorDue(monitor.lastCheckAt, monitor.cadenceMinutes) ? "manual" : "retry";
    result = await runMonitorCheck(monitor);
  }

  const outcome = await recordCheckResult(monitor, result, { trigger });
  const message = describeOutcome({
    status: result.status,
    detail: result.detail,
    action: outcome.action,
    observedAt: outcome.observedAt,
    consecutiveFailures: outcome.consecutiveFailures,
    confirmAfter: outcome.confirmAfter,
  });
  return NextResponse.json({ result, outcome, trigger, message });
}
