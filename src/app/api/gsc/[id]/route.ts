import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gscUpdateSchema } from "@/lib/schemas/gsc";
import { disconnectGscProperty, syncGscProperty, testGscAccess } from "@/lib/integrations/gsc-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const existing = await prisma.gscProperty.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = gscUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const action = parsed.data.action;
  let message = "Updated.";
  let ok = true;

  if (action === "test") {
    const r = await testGscAccess(existing);
    ok = r.ok;
    message = r.message;
  } else if (action === "disconnect") {
    await disconnectGscProperty(existing.id);
    message = "Disconnected. Historical Search Console data is kept.";
  } else if (action === "refresh") {
    const live = await syncGscProperty(existing);
    // No credential: nothing is loaded and existing data is left untouched.
    ok = live.ok;
    message = live.message;
  } else {
    const data: Record<string, unknown> = {};
    if (parsed.data.verified !== undefined) data.verified = parsed.data.verified;
    if (parsed.data.clientId !== undefined) data.clientId = parsed.data.clientId;
    if (Object.keys(data).length) {
      await prisma.gscProperty.update({ where: { id: existing.id }, data });
    }
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: action ? `gsc.${action}` : "gsc.update",
    entity: "GscProperty",
    entityId: existing.id,
    meta: { ok },
  });

  return ok
    ? NextResponse.json({ ok, message })
    : NextResponse.json({ ok, message, error: message }, { status: 409 });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const existing = await prisma.gscProperty.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.gscProperty.delete({ where: { id: existing.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "gsc.delete",
    entity: "GscProperty",
    entityId: existing.id,
  });
  return NextResponse.json({ ok: true });
}
