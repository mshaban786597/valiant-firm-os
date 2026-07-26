import { ClientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z
  .object({
    businessName: z.string().optional(),
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
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const client = await prisma.client.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    include: {
      onboardingItems: { orderBy: { sortOrder: "asc" } },
      tasks: { orderBy: { dueDate: "asc" }, take: 50 },
      reports: { orderBy: { month: "desc" }, take: 12 },
    },
  });

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ client });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("client.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.client.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      contractStart:
        parsed.data.contractStart === undefined
          ? undefined
          : parsed.data.contractStart === null
            ? null
            : new Date(parsed.data.contractStart),
      monthlyValue:
        parsed.data.monthlyValue === undefined ? undefined : parsed.data.monthlyValue,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "client.update",
    entity: "Client",
    entityId: client.id,
  });

  return NextResponse.json({ client });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("client.delete");
  if (!org.ok) return org.response;

  const existing = await prisma.client.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.client.delete({ where: { id: existing.id } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "client.delete",
    entity: "Client",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
