import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { recordReply } from "@/lib/outreach/engine";
import { REPLY_LABELS } from "@/lib/outreach/sequence";

const schema = z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
  threadId: z.string().max(200).optional(),
});

/** Log a prospect reply: it is labeled, and pending follow-ups stop per policy. */
export async function POST(req: Request) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, organizationId: org.organizationId },
    select: { id: true, isDemo: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const r = await recordReply({
    organizationId: org.organizationId,
    leadId: lead.id,
    body: parsed.data.body,
    threadId: parsed.data.threadId,
    isDemo: lead.isDemo,
  });
  const parts = [`Labeled "${REPLY_LABELS[r.label]}"`];
  if (r.needsReview) parts.push("flagged for owner review");
  if (r.canceledFollowUps) parts.push(`${r.canceledFollowUps} pending follow-up(s) canceled`);
  if (r.suppressed) parts.push("address added to the do-not-email list");
  return NextResponse.json({ ...r, message: parts.join("; ") + "." });
}
