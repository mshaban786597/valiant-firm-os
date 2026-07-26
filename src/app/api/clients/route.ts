import { ClientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { ensureOnboardingChecklist } from "@/lib/onboarding";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  businessName: z.string(),
  primaryContact: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  servicePurchased: z.string().nullable().optional(),
  monthlyValue: z.number().nullable().optional(),
  contractStart: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  healthScore: z.number().nullable().optional(),
  assignedSeoLead: z.string().nullable().optional(),
  gbpLocationId: z.string().nullable().optional(),
  ga4PropertyId: z.string().nullable().optional(),
  gscSiteUrl: z.string().nullable().optional(),
  targetLocations: z.array(z.string()).optional(),
  targetServices: z.array(z.string()).optional(),
});

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const clients = await prisma.client.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      onboardingItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json({ clients });
}

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const client = await prisma.client.create({
    data: {
      organizationId: org.organizationId,
      businessName: parsed.data.businessName,
      primaryContact: parsed.data.primaryContact,
      email: parsed.data.email,
      phone: parsed.data.phone,
      websiteUrl: parsed.data.websiteUrl,
      servicePurchased: parsed.data.servicePurchased,
      monthlyValue: parsed.data.monthlyValue ?? undefined,
      contractStart: parsed.data.contractStart
        ? new Date(parsed.data.contractStart)
        : undefined,
      status: parsed.data.status ?? ClientStatus.Onboarding,
      assignedSeoLead: parsed.data.assignedSeoLead,
      healthScore: parsed.data.healthScore ?? undefined,
      gbpLocationId: parsed.data.gbpLocationId,
      ga4PropertyId: parsed.data.ga4PropertyId,
      gscSiteUrl: parsed.data.gscSiteUrl,
      targetLocations: parsed.data.targetLocations ?? [],
      targetServices: parsed.data.targetServices ?? [],
    },
  });

  await ensureOnboardingChecklist(org.organizationId, client.id);

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "client.create",
    entity: "Client",
    entityId: client.id,
  });

  return NextResponse.json({ client });
}
