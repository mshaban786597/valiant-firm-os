import { getDataScope } from "@/lib/scope";
import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { notify } from "@/lib/notifications/dispatch";
import { approvalCreateSchema } from "@/lib/schemas/approvals";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;
  const approvals = await prisma.approvalRequest.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ approvals });
}

export async function POST(req: Request) {
  const org = await requirePermission("approval.request");
  if (!org.ok) return org.response;

  const parsed = approvalCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const approval = await prisma.approvalRequest.create({
    data: {
      organizationId: org.organizationId,
      requestedBy: org.userId,
      isDemo: getDataScope().isDemo,
      ...parsed.data,
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "approval.request",
    entity: "ApprovalRequest",
    entityId: approval.id,
  });
  await notify({
    organizationId: org.organizationId,
    event: "approval_requested",
    title: approval.title,
    path: "/approvals",
    isDemo: approval.isDemo,
  }).catch(() => []);

  return NextResponse.json({ approval });
}
