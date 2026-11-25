import { IncidentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { incidentUpdateSchema } from "@/lib/schemas/monitoring";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const incident = await prisma.incident.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: {
      monitor: { select: { id: true, name: true, target: true } },
      client: { select: { id: true, businessName: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ incident });
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("incident.write");
  if (!org.ok) return org.response;

  const existing = await prisma.incident.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = incidentUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.status) {
    data.status = d.status as IncidentStatus;
    if (d.status === "RESOLVED") data.resolvedAt = new Date();
  }

  const incident = await prisma.incident.update({ where: { id: existing.id }, data });

  if (d.status === "RESOLVED") {
    await prisma.founderAlert.updateMany({
      where: { incidentId: incident.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  if (d.status || d.note) {
    await prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        type: d.status ? d.status.toLowerCase() : "note",
        note: d.note ?? null,
      },
    });
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "incident.update",
    entity: "Incident",
    entityId: incident.id,
    meta: { status: incident.status },
  });
  return NextResponse.json({ incident });
}
