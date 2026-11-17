import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { rankRentUpdateSchema } from "@/lib/schemas/rank-rent";

export const runtime = "nodejs";

/** Update the stage, the renter and the monthly rent of a rank-and-rent site. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("client.write");
  if (!org.ok) return org.response;

  const asset = await prisma.rankRentAsset.findFirst({ where: { id: params.id, organizationId: org.organizationId } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = rankRentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const d = parsed.data;

  const updated = await prisma.rankRentAsset.update({
    where: { id: asset.id },
    data: {
      ...(d.status ? { status: d.status } : {}),
      ...(d.renterStatus !== undefined ? { renterStatus: d.renterStatus || null } : {}),
      ...(d.monthlyRevenue !== undefined ? { monthlyRevenue: d.monthlyRevenue } : {}),
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "rankrent.update",
    entity: "RankRentAsset",
    entityId: asset.id,
    meta: { status: d.status, renterChanged: d.renterStatus !== undefined, revenueChanged: d.monthlyRevenue !== undefined },
  });
  return NextResponse.json({ asset: updated, message: "Saved." });
}

/** Remove a site from the rank-and-rent list. Its checks and analytics are kept. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("client.write");
  if (!org.ok) return org.response;
  const asset = await prisma.rankRentAsset.findFirst({ where: { id: params.id, organizationId: org.organizationId } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.rankRentAsset.delete({ where: { id: asset.id } });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "rankrent.delete",
    entity: "RankRentAsset",
    entityId: asset.id,
    meta: { domain: asset.domain },
  });
  return NextResponse.json({ success: true });
}
