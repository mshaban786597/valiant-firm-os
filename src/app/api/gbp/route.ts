import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { gbpCreateSchema } from "@/lib/schemas/gbp";
import { sampleGbpInsights } from "@/lib/integrations/sample";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const locations = await prisma.gbpLocation.findMany({
    where: { organizationId: org.organizationId },
    include: { client: { select: { id: true, businessName: true } } },
    orderBy: { businessName: "asc" },
    take: 300,
  });
  return NextResponse.json({ locations });
}

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = gbpCreateSchema.safeParse(json);
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

  // gbpId is globally unique in the schema — guard for a friendly error.
  const dupe = await prisma.gbpLocation.findUnique({
    where: { gbpId: data.gbpId },
    select: { id: true },
  });
  if (dupe) {
    return NextResponse.json(
      { error: "A location with that GBP ID already exists." },
      { status: 409 },
    );
  }

  const insights = sampleGbpInsights(data.gbpId);
  const location = await prisma.gbpLocation.create({
    data: {
      organizationId: org.organizationId,
      clientId: data.clientId ?? null,
      gbpId: data.gbpId,
      businessName: data.businessName,
      category: data.category ?? null,
      phone: data.phone ?? null,
      website: data.website ?? null,
      address: data.address ?? null,
      rating: insights.rating,
      reviewCount: insights.reviewCount,
      postsLast30Days: insights.postsLast30Days,
      lastSyncAt: new Date(),
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "gbp.create",
    entity: "GbpLocation",
    entityId: location.id,
  });

  return NextResponse.json({ location });
}
