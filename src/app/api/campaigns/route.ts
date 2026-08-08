import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { campaignCreateSchema } from "@/lib/schemas/campaign";
import { toCents } from "@/lib/money";
import { runTrigger } from "@/lib/automations/engine";

export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const channel = searchParams.get("channel");

  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId: org.organizationId,
      ...(clientId ? { clientId } : {}),
      ...(channel ? { channel: channel as never } : {}),
    },
    include: { client: { select: { id: true, businessName: true } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const org = await requirePermission("campaign.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = campaignCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const client = await prisma.client.findFirst({
    where: { id: d.clientId, organizationId: org.organizationId },
    select: { id: true },
  });
  if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: org.organizationId,
      clientId: d.clientId,
      channel: d.channel,
      name: d.name,
      status: d.status,
      budgetCents: d.budgetDollars ? toCents(d.budgetDollars) : 0,
      goals: d.goals ?? null,
      managerId: d.managerId ?? org.userId,
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "campaign.create",
    entity: "Campaign",
    entityId: campaign.id,
    meta: { channel: campaign.channel },
  });

  await runTrigger("campaign_created", {
    organizationId: org.organizationId,
    userId: org.userId,
    clientId: campaign.clientId,
    payload: { name: campaign.name, channel: campaign.channel },
  }).catch(() => {});

  return NextResponse.json({ campaign });
}
