import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { notify } from "@/lib/notifications/dispatch";
import { openInbox } from "@/lib/outreach/inbox";
import { readReplies } from "@/lib/outreach/read-replies";
import { REPLY_LABELS, type ReplyLabel } from "@/lib/outreach/sequence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Replies a person should hear about straight away. */
const NOTIFY: ReplyLabel[] = ["interested", "question", "needs_review"];

/**
 * Read replies and delivery failures from the outreach mailbox, stop the
 * follow-ups they call for, and alert the owner. CRON_SECRET-gated.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only organizations that really sent outreach have anything to read.
  const orgs = await prisma.outreachSend.findMany({
    where: { isDemo: false, status: "sent", provider: { not: "test" } },
    select: { organizationId: true },
    distinct: ["organizationId"],
    take: 50,
  });
  const totals = { checked: 0, replies: 0, bounces: 0, ignored: 0, duplicates: 0 };
  if (orgs.length === 0) return NextResponse.json({ success: true, configured: true, ...totals, note: "No outreach has been sent yet." });

  let reader;
  try {
    reader = await openInbox();
  } catch {
    await telemetry.error({ source: "cron.read-replies", message: "Could not sign in to the outreach mailbox" });
    return NextResponse.json({ error: "Could not sign in to the outreach mailbox" }, { status: 502 });
  }
  if (!reader) return NextResponse.json({ success: true, configured: false, ...totals, note: "Outreach mailbox is not configured." });

  try {
    for (const { organizationId } of orgs) {
      const run = await readReplies({ organizationId, reader });
      totals.checked += run.checked;
      totals.replies += run.replies;
      totals.bounces += run.bounces;
      totals.ignored += run.ignored;
      totals.duplicates += run.duplicates;

      for (const r of run.recorded.filter((x) => NOTIFY.indexOf(x.label) !== -1)) {
        const lead = await prisma.lead.findFirst({
          where: { id: r.leadId, organizationId },
          select: { businessName: true },
        });
        await notify({
          organizationId,
          event: "outreach_reply",
          title: `${lead?.businessName ?? "A prospect"}: ${REPLY_LABELS[r.label]}`,
          body: r.needsReview ? "Needs your review before anything else is sent." : "Follow-ups for this prospect have stopped.",
          path: `/leads/${r.leadId}`,
        });
      }
    }
  } finally {
    await reader.close();
  }

  await telemetry.info({
    source: "cron.read-replies",
    message: `Outreach inbox: ${totals.replies} replies, ${totals.bounces} delivery failures, ${totals.ignored} unrelated skipped`,
  });
  return NextResponse.json({ success: true, configured: true, ...totals });
}
