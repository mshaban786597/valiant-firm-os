import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { syncGa4Property } from "@/lib/integrations/ga4-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  action: z.enum(["refresh"]).optional(),
  clientId: z.string().uuid().nullable().optional(),
});

/** Sync one Analytics property now, or link it to a client. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const property = await prisma.ga4Property.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  let ok = true;
  let message = "Updated.";
  if (parsed.data.clientId !== undefined) {
    if (parsed.data.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: parsed.data.clientId, organizationId: org.organizationId },
        select: { id: true },
      });
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    await prisma.ga4Property.update({ where: { id: property.id }, data: { clientId: parsed.data.clientId } });
  }
  if (parsed.data.action === "refresh") {
    const r = await syncGa4Property(property);
    ok = r.ok;
    message = r.message;
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: parsed.data.action ? `ga4.${parsed.data.action}` : "ga4.update",
    entity: "Ga4Property",
    entityId: property.id,
    meta: { ok },
  });
  return ok ? NextResponse.json({ ok, message }) : NextResponse.json({ error: message }, { status: 502 });
}
