import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { monitorUpdateSchema } from "@/lib/schemas/monitoring";
import { backfillIncidentTasks } from "@/lib/clients/link-site";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("monitor.write");
  if (!org.ok) return org.response;

  const existing = await prisma.monitor.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = monitorUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  for (const k of ["name", "target", "cadenceMinutes", "enabled", "clientId"] as const) {
    if (d[k] !== undefined) data[k] = d[k];
  }

  // Never trust a client id from the request: it must belong to this organization.
  if (d.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: d.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });
  }

  const monitor = await prisma.monitor.update({ where: { id: existing.id }, data });

  // A check that just got an owning client: give its open incidents the task they
  // could not have before (one per incident, never a duplicate).
  const tasksCreated = d.clientId ? await backfillIncidentTasks(org.organizationId, monitor, d.clientId) : 0;
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "monitor.update",
    entity: "Monitor",
    entityId: monitor.id,
  });
  return NextResponse.json({ monitor, tasksCreated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("monitor.write");
  if (!org.ok) return org.response;

  const existing = await prisma.monitor.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.monitor.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "monitor.delete",
    entity: "Monitor",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
