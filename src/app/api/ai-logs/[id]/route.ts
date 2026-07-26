import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.aiLog.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.aiLog.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "aiLog.delete",
    entity: "AiLog",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
