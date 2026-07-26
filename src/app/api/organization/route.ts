import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
  })
  .strict();

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const organization = await prisma.organization.findUnique({
    where: { id: org.organizationId },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ organization });
}

export async function PATCH(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const organization = await prisma.organization.update({
    where: { id: org.organizationId },
    data: parsed.data,
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "organization.update",
    entity: "Organization",
    entityId: organization.id,
  });

  return NextResponse.json({ organization });
}
