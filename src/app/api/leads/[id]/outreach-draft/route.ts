import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/dispatch";
import { queueOutreachDraft } from "@/lib/prospecting/drafts";

/** Draft an outreach email for a lead and queue it for human approval. Never sends. */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("approval.request");
  if (!org.ok) return org.response;

  const r = await queueOutreachDraft({ organizationId: org.organizationId, leadId: params.id, requestedBy: org.userId });
  if (!r.ok) {
    if (r.reason === "lead_not_found") return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ error: "This address is on the do-not-email list, so no email was drafted." }, { status: 409 });
  }
  const approval = await prisma.approvalRequest.findUnique({ where: { id: r.approvalId } });
  if (r.created && approval) {
    await notify({
      organizationId: org.organizationId,
      event: "approval_requested",
      title: approval.title,
      path: "/approvals",
      isDemo: approval.isDemo,
    }).catch(() => []);
  }
  return NextResponse.json({ approval, created: r.created });
}
