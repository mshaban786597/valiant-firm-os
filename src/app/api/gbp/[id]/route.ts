import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gbpUpdateSchema } from "@/lib/schemas/gbp";
import { sampleGbpInsights } from "@/lib/integrations/sample";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.gbpLocation.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, gbpId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = gbpUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.action === "refresh") {
    // No OAuth configured → deterministic sample refresh.
    const insights = sampleGbpInsights(`${existing.gbpId}:${Date.now()}`);
    data.rating = insights.rating;
    data.reviewCount = insights.reviewCount;
    data.postsLast30Days = insights.postsLast30Days;
    data.lastSyncAt = new Date();
  }
  for (const k of ["category", "phone", "website", "address", "clientId"] as const) {
    if (parsed.data[k] !== undefined) data[k] = parsed.data[k];
  }

  const location = await prisma.gbpLocation.update({
    where: { id: existing.id },
    data,
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: parsed.data.action === "refresh" ? "gbp.refresh" : "gbp.update",
    entity: "GbpLocation",
    entityId: location.id,
  });

  return NextResponse.json({ location });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const existing = await prisma.gbpLocation.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.gbpLocation.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "gbp.delete",
    entity: "GbpLocation",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
