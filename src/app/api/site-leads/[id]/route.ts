import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { LEAD_STATUSES } from "@/lib/site-leads/parse";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().max(4000).optional(),
});

/** Change the status or the notes of one website enquiry. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const lead = await prisma.siteLead.findFirst({ where: { id: params.id, organizationId: org.organizationId }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.siteLead.update({
    where: { id: lead.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "sitelead.update",
    entity: "SiteLead",
    entityId: lead.id,
    meta: { status: parsed.data.status, notesChanged: parsed.data.notes !== undefined },
  });
  return NextResponse.json({ ok: true });
}

/** Delete an enquiry for good (for example a test, or on a person's request to be removed). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("lead.delete");
  if (!org.ok) return org.response;
  const lead = await prisma.siteLead.findFirst({ where: { id: params.id, organizationId: org.organizationId }, select: { id: true, isTest: true } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.siteLead.delete({ where: { id: lead.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "sitelead.delete",
    entity: "SiteLead",
    entityId: lead.id,
    meta: { isTest: lead.isTest },
  });
  return NextResponse.json({ ok: true });
}
