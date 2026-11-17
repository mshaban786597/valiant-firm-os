import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { prospectTargetPatchSchema } from "@/lib/schemas/prospecting";

export const runtime = "nodejs";

async function load(id: string, organizationId: string) {
  return prisma.prospectTarget.findFirst({ where: { id, organizationId } });
}

/** Pause or resume a saved search. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;
  const parsed = prospectTargetPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const target = await load(params.id, org.organizationId);
  if (!target) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  const updated = await prisma.prospectTarget.update({ where: { id: target.id }, data: { active: parsed.data.active } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "prospecting.target.update",
    entity: "ProspectTarget",
    entityId: target.id,
    meta: { active: parsed.data.active },
  });
  return NextResponse.json({ target: updated });
}

/** Remove a saved search. Prospects it already found are kept. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;
  const target = await load(params.id, org.organizationId);
  if (!target) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  await prisma.prospectTarget.delete({ where: { id: target.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "prospecting.target.delete",
    entity: "ProspectTarget",
    entityId: target.id,
    meta: { keyword: target.keyword, city: target.city, state: target.state },
  });
  return NextResponse.json({ success: true });
}
