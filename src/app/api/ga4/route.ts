import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { discoverGa4Properties } from "@/lib/integrations/ga4-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;
  const properties = await prisma.ga4Property.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { sessions28d: "desc" },
  });
  return NextResponse.json({ properties });
}

/** Register every Analytics property the Google credential can read. Never removes one. */
export async function POST() {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const r = await discoverGa4Properties(org.organizationId);
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "ga4.discover",
    entity: "Ga4Property",
    meta: { ok: r.ok, found: r.found, added: r.added, linked: r.linked },
  });
  return r.ok
    ? NextResponse.json({ ok: true, message: r.message, found: r.found, added: r.added })
    : NextResponse.json({ error: r.message }, { status: r.state === "not_configured" ? 409 : 502 });
}
