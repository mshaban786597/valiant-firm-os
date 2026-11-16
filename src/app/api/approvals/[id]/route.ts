import { NextResponse } from "next/server";
import { ApprovalStatus } from "@prisma/client";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { approvalDecisionSchema } from "@/lib/schemas/approvals";

export const runtime = "nodejs";

/** Send an approved outreach email via Resend, if configured. Returns the truthful outcome. */
async function sendApprovedEmail(payload: {
  to?: string;
  subject?: string;
  body?: string;
}): Promise<string> {
  if (!payload.to) return "Approved — not sent: the lead has no email address";
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Approved — not sent: no email provider configured (set RESEND_API_KEY)";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from:
          process.env.OUTREACH_EMAIL_FROM ||
          process.env.ALERT_EMAIL_FROM ||
          "Valiant Firm <onboarding@resend.dev>",
        to: [payload.to],
        subject: payload.subject ?? "",
        text: payload.body ?? "",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? `Email sent to ${payload.to}` : `Approved — send failed (HTTP ${res.status})`;
  } catch {
    return "Approved — send failed (network error)";
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
  if (parsed.data.decision === "APPROVED" && approval.kind === "outreach_email") {
    outcome = await sendApprovedEmail(
      (approval.payload ?? {}) as { to?: string; subject?: string; body?: string },
    );
    if (outcome.startsWith("Email sent") && approval.entityType === "Lead" && approval.entityId) {
      await prisma.lead
        .updateMany({
          where: {
            id: approval.entityId,
            organizationId: org.organizationId,
            sequenceStartedAt: null,
          },
          data: { sequenceStartedAt: new Date() },
        })
        .catch(() => {});
    }
  } else if (parsed.data.decision === "APPROVED") {
    outcome = "Approved";
  } else {
    outcome = "Rejected — nothing was sent or changed";
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
