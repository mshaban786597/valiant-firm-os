import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { buildIncidentReport, releaseReportToClient } from "@/lib/reports/incident-report";

const schema = z.union([
  z.object({ action: z.literal("build"), incidentId: z.string().uuid() }),
  z.object({ action: z.literal("release"), reportId: z.string().uuid() }),
]);

/**
 * build    create a new report version from an incident's persisted evidence
 * release  mark a report client-ready (refused unless it is the latest version,
 *          has evidence, and its change is approved and verified)
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (parsed.data.action === "build") {
    const org = await requirePermission("report.write");
    if (!org.ok) return org.response;
    const r = await buildIncidentReport({
      organizationId: org.organizationId,
      incidentId: parsed.data.incidentId,
      userId: org.userId,
    });
    return r.ok
      ? NextResponse.json({ ...r, message: `Report version ${r.version} created from the incident evidence.` })
      : NextResponse.json({ error: r.reason }, { status: 409 });
  }

  const org = await requirePermission("report.send");
  if (!org.ok) return org.response;
  const r = await releaseReportToClient({
    organizationId: org.organizationId,
    reportId: parsed.data.reportId,
    userId: org.userId,
  });
  return r.ok
    ? NextResponse.json({ ok: true, message: "Report marked client-ready." })
    : NextResponse.json({ error: `Not released: ${r.reason}.` }, { status: 409 });
}
