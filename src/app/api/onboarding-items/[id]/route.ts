import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  completed: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
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

  const item = await prisma.onboardingItem.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.onboardingItem.update({
    where: { id: item.id },
    data: {
      completed: parsed.data.completed,
      completedAt: parsed.data.completed ? new Date() : null,
    },
  });

  return NextResponse.json({ item: updated });
}
