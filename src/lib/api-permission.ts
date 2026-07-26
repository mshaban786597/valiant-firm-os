import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { writeAuditLog } from "@/lib/audit";
import { can, type Action } from "@/lib/permissions";

/**
 * Like requireApiOrg, but also enforces that the caller's role is granted the
 * given permission. On denial it writes an `access.denied` audit row and
 * returns a 403 response. Use at the top of every write handler:
 *
 *   const gate = await requirePermission("invoice.write");
 *   if (!gate.ok) return gate.response;
 */
export async function requirePermission(action: Action) {
  const org = await requireApiOrg();
  if (!org.ok) return org;

  const role = org.session.role;
  if (!can(role, action)) {
    await writeAuditLog({
      organizationId: org.organizationId,
      userId: org.userId,
      action: "access.denied",
      entity: "Permission",
      meta: { attempted: action, role: role ?? null },
    });
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return org;
}
