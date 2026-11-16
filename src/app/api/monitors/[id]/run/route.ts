import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { monitorRunSchema } from "@/lib/schemas/monitoring";
import { runMonitorCheck } from "@/lib/monitoring/runner";
import { recordCheckResult, type CheckResult } from "@/lib/monitoring/incidents";

export const runtime = "nodejs";

/**
 * Run a monitor's check now. Pass { simulate: "fail" | "ok", detail } to force a
 * result instead of probing the target (used by the Client-Ops pilot to
 * simulate a broken lead route). Drives the full incident lifecycle.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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
  if (parsed.data.simulate) {
    result = {
      status: parsed.data.simulate,
      detail: parsed.data.detail ?? `Simulated ${parsed.data.simulate}`,
      affectedObject: monitor.target,
      checkKind: monitor.type.toLowerCase(),
    };
  } else {
    result = await runMonitorCheck(monitor);
  }

  const outcome = await recordCheckResult(monitor, result);
  return NextResponse.json({ result, outcome });
}
