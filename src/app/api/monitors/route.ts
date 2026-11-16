import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { monitorCreateSchema } from "@/lib/schemas/monitoring";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const monitors = await prisma.monitor.findMany({
    where: { organizationId: org.organizationId },
    include: {
      client: { select: { id: true, businessName: true } },
      _count: { select: { incidents: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ monitors });
}

export async function POST(req: Request) {
  const org = await requirePermission("monitor.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = monitorCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: d.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });
  }

  const monitor = await prisma.monitor.create({
    data: {
      organizationId: org.organizationId,
      clientId: d.clientId ?? null,
      name: d.name,
      type: d.type,
      target: d.target,
      cadenceMinutes: d.cadenceMinutes,
      enabled: d.enabled,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "monitor.create",
    entity: "Monitor",
    entityId: monitor.id,
  });

  return NextResponse.json({ monitor });
}
