import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const upsertSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const settings = await prisma.setting.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const setting = await prisma.setting.upsert({
    where: {
      organizationId_key: {
        organizationId: org.organizationId,
        key: parsed.data.key,
      },
    },
    update: { value: parsed.data.value as Prisma.InputJsonValue },
    create: {
      organizationId: org.organizationId,
      key: parsed.data.key,
      value: parsed.data.value as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "setting.upsert",
    entity: "Setting",
    entityId: setting.id,
    meta: { key: setting.key },
  });

  return NextResponse.json({ setting });
}
