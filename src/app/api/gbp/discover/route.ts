import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { writeAuditLog } from "@/lib/audit";
import { discoverGbpLocations } from "@/lib/integrations/gbp-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Register every Business Profile the Google credential manages. Never removes one. */
export async function POST() {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const r = await discoverGbpLocations(org.organizationId);
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "gbp.discover",
    entity: "GbpLocation",
    meta: { ok: r.ok, state: r.state, found: r.found, added: r.added, invitationsAccepted: r.invitationsAccepted },
  });
  return r.ok
    ? NextResponse.json({ ok: true, message: r.message, found: r.found, added: r.added })
    : NextResponse.json({ error: r.message, state: r.state }, { status: r.state === "not_configured" ? 409 : 502 });
}
