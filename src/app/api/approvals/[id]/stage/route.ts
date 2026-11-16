import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { executeChange, rollbackChange, verifyChange } from "@/lib/changes/lifecycle";
import { runMonitorCheck } from "@/lib/monitoring/runner";
import { recordCheckResult } from "@/lib/monitoring/incidents";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  stage: z.enum(["execute", "verify", "rollback"]),
  note: z.string().max(500).optional(),
});

/**
 * Advance an approved change proposal.
 *  - execute  record that the controlled worker applied the staged patch
 *             (refused, and audited, without a valid unexpired approval)
 *  - verify   re-run the incident's original check for real
 *  - rollback record that the change was rolled back
 * Each stage is stored independently, including failures.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("approval.decide");
  if (!org.ok) return org.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const base = { organizationId: org.organizationId, approvalId: params.id, userId: org.userId };
  const note = parsed.data.note?.trim();

  if (parsed.data.stage === "execute") {
    const r = await executeChange({
      ...base,
      worker: async () => ({ ok: true, detail: note || "Applied by operator through the controlled worker" }),
    });
    return NextResponse.json(r.ok ? r : { ...r, error: r.message }, { status: r.ok ? 200 : r.reason === "not_found" ? 404 : 403 });
  }

  if (parsed.data.stage === "rollback") {
    const r = await rollbackChange({
      ...base,
      worker: async () => ({ ok: true, detail: note || "Rolled back by operator" }),
    });
    return NextResponse.json(r.ok ? r : { ...r, error: r.message }, { status: r.ok ? 200 : 409 });
  }

  // verify: re-run the original check that raised the incident.
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { incidentId: true },
  });
  if (!approval) return NextResponse.json({ ok: false, error: "Change not found." }, { status: 404 });
  const incident = approval.incidentId
    ? await prisma.incident.findFirst({
        where: { id: approval.incidentId, organizationId: org.organizationId },
        include: { monitor: true },
      })
    : null;
  const monitor = incident?.monitor ?? null;
  if (!monitor) {
    return NextResponse.json(
      { ok: false, error: "This change is not linked to a check that can be re-run." },
      { status: 409 },
    );
  }
  if (monitor.type === "LEAD_ROUTE" || monitor.type === "CUSTOM") {
    return NextResponse.json(
      { ok: false, error: "This check has no automated probe. Record its result from Monitoring, then verify." },
      { status: 409 },
    );
  }
  const r = await verifyChange({
    ...base,
    recheck: async () => {
      const result = await runMonitorCheck(monitor);
      await recordCheckResult(monitor, result, { trigger: "manual" });
      return { passed: result.status === "ok", detail: result.detail ?? result.status };
    },
  });
  return NextResponse.json(r.ok ? r : { ...r, error: r.message }, { status: r.ok ? 200 : 409 });
}
