import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { rankRentCreateSchema } from "@/lib/schemas/rank-rent";

export const runtime = "nodejs";

/** Register one of our own lead-generation sites as a rank-and-rent asset. */
export async function POST(req: Request) {
  const org = await requirePermission("client.write");
  if (!org.ok) return org.response;

  const parsed = rankRentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter the domain, niche, city and state." }, { status: 400 });
  }
  const d = parsed.data;
  const existing = await prisma.rankRentAsset.findFirst({
    where: { organizationId: org.organizationId, domain: d.domain },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "That site is already listed." }, { status: 409 });

  const asset = await prisma.rankRentAsset.create({
    data: { organizationId: org.organizationId, domain: d.domain, niche: d.niche, city: d.city, state: d.state, status: d.status ?? "Research" },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "rankrent.create",
    entity: "RankRentAsset",
    entityId: asset.id,
    meta: { domain: d.domain },
  });
  return NextResponse.json({ asset, message: `${d.domain} added.` });
}
