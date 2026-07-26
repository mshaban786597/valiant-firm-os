import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: LeadStatus.OutreachQueue,
      outreachQueuedAt: new Date(),
    },
  });

  return NextResponse.json({ lead: updated });
}
