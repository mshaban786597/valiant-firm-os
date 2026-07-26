import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { emailCampaignCreateSchema } from "@/lib/schemas/email-campaign";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const campaigns = await prisma.emailCampaign.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const org = await requirePermission("email.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = emailCampaignCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: org.organizationId,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: "draft",
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "email_campaign.create",
    entity: "EmailCampaign",
    entityId: campaign.id,
  });

  return NextResponse.json({ campaign });
}
