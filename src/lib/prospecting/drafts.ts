import { ApprovalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { buildOutreachDraft, draftOptionsFromEnv } from "@/lib/outreach/draft";

export type QueueDraftResult =
  | { ok: true; approvalId: string; category: string; subject: string; created: boolean }
  | { ok: false; reason: "lead_not_found" | "no_email" | "suppressed" };

/**
 * Write the outreach email for one lead from its stored evidence and put it in
 * Review & Approvals. Nothing is sent here: the sequence starts only when a
 * person approves the draft. Calling it again while a draft is still waiting
 * returns that draft instead of creating another.
 */
export async function queueOutreachDraft(input: {
  organizationId: string;
  leadId: string;
  requestedBy?: string | null;
  /** When true, a lead with no email address is skipped instead of drafted. */
  requireEmail?: boolean;
}): Promise<QueueDraftResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, organizationId: input.organizationId },
    include: { evidence: { orderBy: { observedAt: "desc" }, take: 20 } },
  });
  if (!lead) return { ok: false, reason: "lead_not_found" };
  if (input.requireEmail && !lead.email) return { ok: false, reason: "no_email" };
  if (lead.email) {
    const blocked = await prisma.suppression.findFirst({
      where: { organizationId: input.organizationId, email: lead.email.toLowerCase() },
      select: { id: true },
    });
    if (blocked) return { ok: false, reason: "suppressed" };
  }

  const draft = buildOutreachDraft(lead, draftOptionsFromEnv(), lead.evidence);
  const waiting = await prisma.approvalRequest.findFirst({
    where: {
      organizationId: input.organizationId,
      kind: "outreach_email",
      entityType: "Lead",
      entityId: lead.id,
      status: ApprovalStatus.PENDING,
    },
    select: { id: true },
  });
  if (waiting) return { ok: true, approvalId: waiting.id, category: draft.category, subject: draft.subject, created: false };

  // A rank read weeks ago may have moved: tell the reviewer before they approve.
  const rankSeen = lead.evidence.filter((e) => e.kind === "rank_observation")[0];
  const ageDays = rankSeen ? Math.floor((Date.now() - rankSeen.observedAt.getTime()) / 86_400_000) : 0;
  const reviewerNote =
    rankSeen && ageDays > 14
      ? `Reviewer note: the ranking in this email was observed on ${rankSeen.observedAt.toISOString().slice(0, 10)} (${ageDays} days ago). Re-check it before approving.\n\n`
      : "";

  const approval = await prisma.approvalRequest.create({
    data: {
      organizationId: input.organizationId,
      kind: "outreach_email",
      isDemo: lead.isDemo,
      title: `Outreach email → ${lead.businessName}`,
      body: `${reviewerNote}To: ${lead.email ?? "(no email on lead)"}\nSubject: ${draft.subject}\n\n${draft.body}`,
      payload: { to: lead.email ?? undefined, subject: draft.subject, body: draft.body, category: draft.category },
      entityType: "Lead",
      entityId: lead.id,
      requestedBy: input.requestedBy ?? null,
    },
  });
  if (!lead.outreachCategory) {
    await prisma.lead.update({ where: { id: lead.id }, data: { outreachCategory: draft.category } });
  }
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.requestedBy ?? undefined,
    action: "approval.request",
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { leadId: lead.id, kind: "outreach_email", category: draft.category },
  });
  return { ok: true, approvalId: approval.id, category: draft.category, subject: draft.subject, created: true };
}
