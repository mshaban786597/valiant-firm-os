import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gbpUpdateSchema } from "@/lib/schemas/gbp";
import { syncGbpLocation } from "@/lib/integrations/gbp-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const existing = await prisma.gbpLocation.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, gbpId: true, accountName: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = gbpUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.action === "refresh") {
    const r = await syncGbpLocation(existing);
    await writeAuditLog({
      organizationId: org.organizationId,
      userId: org.userId,
      action: "gbp.refresh",
      entity: "GbpLocation",
      entityId: existing.id,
      meta: { ok: r.ok, state: r.state },
    });
    return r.ok
      ? NextResponse.json({ ok: true, message: r.message })
      : NextResponse.json({ error: r.message }, { status: r.state === "not_configured" ? 409 : 502 });
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
  const org = await requirePermission("integration.write");
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
