import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { monitorUpdateSchema } from "@/lib/schemas/monitoring";
import { defaultSeverity } from "@/lib/monitoring/fingerprint";

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
  let tasksCreated = 0;
  if (d.clientId) {
    const orphans = await prisma.incident.findMany({
      where: {
        organizationId: org.organizationId,
        monitorId: monitor.id,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        taskId: null,
      },
    });
    for (const incident of orphans) {
      const task = await prisma.task.create({
        data: {
          organizationId: org.organizationId,
          clientId: d.clientId,
          title: `Investigate: ${monitor.name}`,
          description: `Open incident from check "${monitor.name}" (${monitor.target}, ${monitor.environment}). ${incident.title}
First seen ${incident.firstSeenAt.toISOString()}.`,
          serviceType: "Monitoring",
          owner: monitor.owner ?? null,
          priority: defaultSeverity(monitor.kind ?? monitor.type) === "CRITICAL" ? "Critical" : "High",
          isDemo: monitor.isDemo,
        },
      });
      // Claim the incident only if it still has no task.
      const claimed = await prisma.incident.updateMany({
        where: { id: incident.id, taskId: null },
        data: { taskId: task.id, clientId: d.clientId },
      });
      if (claimed.count === 0) {
        await prisma.task.delete({ where: { id: task.id } }).catch(() => {});
        continue;
      }
      await prisma.incidentEvent.create({
        data: { incidentId: incident.id, type: "task_created", note: task.id },
      });
      tasksCreated++;
    }
  }
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
