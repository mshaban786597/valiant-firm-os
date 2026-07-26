import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gscCreateSchema } from "@/lib/schemas/gsc";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const properties = await prisma.gscProperty.findMany({
    where: { organizationId: org.organizationId },
    include: {
      client: { select: { id: true, businessName: true } },
      _count: { select: { keywords: true } },
    },
    orderBy: { siteUrl: "asc" },
    take: 200,
  });
  return NextResponse.json({ properties });
}

export async function POST(req: Request) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = gscCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Unknown client" }, { status: 400 });
    }
  }

  const dupe = await prisma.gscProperty.findFirst({
    where: { organizationId: org.organizationId, siteUrl: data.siteUrl },
    select: { id: true },
  });
  if (dupe) {
    return NextResponse.json(
      { error: "That site URL is already registered." },
      { status: 409 },
    );
  }

  const property = await prisma.gscProperty.create({
    data: {
      organizationId: org.organizationId,
      clientId: data.clientId ?? null,
      siteUrl: data.siteUrl,
      verified: data.verified ?? false,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "gsc.create",
    entity: "GscProperty",
    entityId: property.id,
  });

  return NextResponse.json({ property });
}
