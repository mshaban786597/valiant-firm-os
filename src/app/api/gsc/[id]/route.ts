import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gscUpdateSchema } from "@/lib/schemas/gsc";
import { sampleGscInsights } from "@/lib/integrations/sample";
import { disconnectGscProperty, syncGscProperty, testGscAccess } from "@/lib/integrations/gsc-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const existing = await prisma.gscProperty.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: { client: { select: { servicePurchased: true, targetLocations: true } } },
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
    if (live.state === "not_configured") {
      // No Google credential: refuse to overwrite real data with sample data.
      if (existing.dataSource === "live") {
        ok = false;
        message = "No Google credential is configured, so the last live data was left unchanged.";
      } else {
        const niche = existing.client?.servicePurchased ?? "services";
        const city = existing.client?.targetLocations?.[0] ?? "your area";
        const insights = sampleGscInsights(existing.siteUrl, niche, city);
        await prisma.$transaction([
          prisma.gscKeyword.deleteMany({ where: { propertyId: existing.id } }),
          prisma.gscKeyword.createMany({
            data: insights.keywords.map((k) => ({
              propertyId: existing.id,
              query: k.query,
              clicks: k.clicks,
              impressions: k.impressions,
              ctr: k.ctr,
              position: k.position,
            })),
          }),
          prisma.gscProperty.update({
            where: { id: existing.id },
            data: {
              clicks28d: insights.clicks28d,
              impressions28d: insights.impressions28d,
              avgPosition: insights.avgPosition,
              lastSyncAt: new Date(),
              lastAttemptAt: new Date(),
              dataSource: "sample",
            },
          }),
        ]);
        message =
          "Loaded SAMPLE data (not from Search Console). Set GOOGLE_SERVICE_ACCOUNT_JSON to sync real data.";
      }
    } else {
      ok = live.ok;
      message = live.message;
    }
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

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
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
