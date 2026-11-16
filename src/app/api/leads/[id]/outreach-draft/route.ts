import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { notify } from "@/lib/notifications/dispatch";
import { buildOutreachDraft } from "@/lib/outreach/draft";

/** Draft an outreach email for a lead and queue it for human approval. Never sends. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const org = await requirePermission("approval.request");
  if (!org.ok) return org.response;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const draft = buildOutreachDraft(lead);
  const approval = await prisma.approvalRequest.create({
    data: {
      organizationId: org.organizationId,
      kind: "outreach_email",
      isDemo: lead.isDemo,
      title: `Outreach email → ${lead.businessName}`,
      body: `To: ${lead.email ?? "(no email on lead)"}\nSubject: ${draft.subject}\n\n${draft.body}`,
      payload: { to: lead.email ?? undefined, subject: draft.subject, body: draft.body },
      entityType: "Lead",
      entityId: lead.id,
      requestedBy: org.userId,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "approval.request",
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { leadId: lead.id, kind: "outreach_email" },
  });
  await notify({
    organizationId: org.organizationId,
    event: "approval_requested",
    title: approval.title,
    path: "/approvals",
    isDemo: lead.isDemo,
  }).catch(() => []);

  return NextResponse.json({ approval });
}
