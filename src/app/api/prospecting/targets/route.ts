import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getDataScope } from "@/lib/scope";
import { prospectTargetSchema } from "@/lib/schemas/prospecting";

export const runtime = "nodejs";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;
  const targets = await prisma.prospectTarget.findMany({
    where: { organizationId: org.organizationId, isDemo: getDataScope().isDemo },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ targets });
}

/** Save a search for the prospecting agent to repeat: one niche in one place. */
export async function POST(req: Request) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;

  const parsed = prospectTargetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the niche, the search phrase, the city and the state." }, { status: 400 });
  }
  const d = parsed.data;
  const existing = await prisma.prospectTarget.findFirst({
    where: {
      organizationId: org.organizationId,
      keyword: { equals: d.keyword, mode: "insensitive" },
      city: { equals: d.city, mode: "insensitive" },
      state: { equals: d.state, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "That search is already saved." }, { status: 409 });

  const target = await prisma.prospectTarget.create({
    data: { organizationId: org.organizationId, isDemo: getDataScope().isDemo, ...d },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "prospecting.target.create",
    entity: "ProspectTarget",
    entityId: target.id,
    meta: { keyword: d.keyword, city: d.city, state: d.state },
  });
  return NextResponse.json({ target });
}
