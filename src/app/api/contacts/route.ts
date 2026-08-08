import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { contactCreateSchema } from "@/lib/schemas/contact";
import { runTrigger } from "@/lib/automations/engine";

export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const clientId = searchParams.get("clientId");

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: org.organizationId,
      ...(clientId ? { clientId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { client: { select: { id: true, businessName: true } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  return NextResponse.json({ contacts });
}

export async function POST(req: Request) {
  const org = await requirePermission("contact.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = contactCreateSchema.safeParse(json);
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
    if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      organizationId: org.organizationId,
      clientId: data.clientId ?? null,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      title: data.title ?? null,
      role: data.role ?? null,
      source: data.source ?? null,
      tags: data.tags ?? [],
      ownerId: data.ownerId ?? org.userId,
      notes: data.notes ?? null,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "contact.create",
    entity: "Contact",
    entityId: contact.id,
  });

  await runTrigger("contact_created", {
    organizationId: org.organizationId,
    userId: org.userId,
    clientId: contact.clientId ?? undefined,
    payload: { name: contact.name },
  }).catch(() => {});

  return NextResponse.json({ contact });
}
