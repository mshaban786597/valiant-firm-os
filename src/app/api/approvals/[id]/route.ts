import { NextResponse } from "next/server";
import { ApprovalStatus } from "@prisma/client";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { approvalDecisionSchema } from "@/lib/schemas/approvals";
import { processDueSends, providerFor, recipientAllowed, startSequence } from "@/lib/outreach/engine";

export const runtime = "nodejs";

/**
 * Start the approved outreach sequence and send the first email now.
 * Returns the truthful outcome: sent (with provider reference), canceled by a
 * pre-send recheck, or scheduled-but-not-sent when no sender is configured.
 */
async function startApprovedOutreach(approval: {
  id: string;
  organizationId: string;
  entityId: string | null;
  isDemo: boolean;
  payload: unknown;
}): Promise<string> {
  const payload = (approval.payload ?? {}) as { to?: string; subject?: string; body?: string };
  if (!payload.to) return "Approved — not sent: the lead has no email address";
  if (!approval.entityId) return "Approved — not sent: no lead is linked to this draft";

  await startSequence({
    organizationId: approval.organizationId,
    leadId: approval.entityId,
    toEmail: payload.to,
    subject: payload.subject ?? "",
    body: payload.body ?? "",
    approvalId: approval.id,
    isDemo: approval.isDemo,
  });
  if (!providerFor(approval.isDemo)) {
    return "Approved — scheduled, not sent: real outreach sending is switched off";
  }
  if (!approval.isDemo && !recipientAllowed(payload.to)) {
    return "Approved — scheduled, not sent: this address is not on the allowed-recipient list";
  }
  await processDueSends({ organizationId: approval.organizationId, isDemo: approval.isDemo });
  const first = await prisma.outreachSend.findFirst({
    where: { leadId: approval.entityId, step: 0 },
    select: { status: true, provider: true, providerMessageId: true, cancelReason: true },
  });
  if (!first) return "Approved — nothing was scheduled";
  if (first.status === "sent") {
    return `Email accepted by ${first.provider} (ref ${first.providerMessageId ?? "none"}) for ${payload.to}; 2 follow-ups scheduled`;
  }
  if (first.status === "canceled") return `Approved — not sent: ${first.cancelReason}`;
  if (first.status === "needs_reconcile") return "Approved — send result unclear; it will be reconciled before any retry";
  return `Approved — send ${first.status}${first.cancelReason ? ` (${first.cancelReason})` : ""}`;
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("approval.decide");
  if (!org.ok) return org.response;

  const parsed = approvalDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  // Compare-and-set: only a PENDING request can be decided, exactly once.
  const claimed = await prisma.approvalRequest.updateMany({
    where: { id: params.id, organizationId: org.organizationId, status: ApprovalStatus.PENDING },
    data: {
      status: parsed.data.decision,
      decidedBy: org.userId,
      decidedAt: new Date(),
      decisionNote: parsed.data.note ?? null,
    },
  });
  if (claimed.count === 0) {
    const exists = await prisma.approvalRequest.findFirst({
      where: { id: params.id, organizationId: org.organizationId },
      select: { status: true },
    });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: `Already ${exists.status.toLowerCase()}` }, { status: 409 });
  }

  const approval = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: params.id } });
  let outcome: string;
  if (parsed.data.decision === "REJECTED") {
    outcome = "Rejected — nothing was sent or changed";
  } else if (approval.kind === "outreach_email") {
    outcome = await startApprovedOutreach(approval);
  } else if (approval.kind === "fix") {
    outcome = "Approved — ready to execute";
  } else {
    outcome = "Approved";
  }
  await prisma.approvalRequest.update({ where: { id: approval.id }, data: { outcome } });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: `approval.${parsed.data.decision.toLowerCase()}`,
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { outcome },
  });

  return NextResponse.json({ approval: { ...approval, outcome } });
}
