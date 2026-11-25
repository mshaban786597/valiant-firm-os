import { prisma } from "@/lib/prisma";
import { recordReply } from "@/lib/outreach/engine";
import { belongsToOutreach, matchIncoming, type InboxReader } from "@/lib/outreach/inbox";
import type { ReplyLabel } from "@/lib/outreach/sequence";

/** How far back the inbox is searched. Anything older was handled by an earlier run. */
export const LOOKBACK_DAYS = 14;
/** Messages looked at per run. */
export const PER_RUN = 50;

export interface RecordedReply {
  leadId: string;
  label: ReplyLabel;
  needsReview: boolean;
  suppressed: boolean;
}

export interface ReadSummary {
  /** Messages opened in this run: only ones that belong to outreach. */
  checked: number;
  replies: number;
  bounces: number;
  /** Mail that has nothing to do with outreach: never opened, marked or stored. */
  ignored: number;
  /** Already recorded by an earlier run. */
  duplicates: number;
  recorded: RecordedReply[];
}

/** Every address a real outreach email went to, with its lead and thread (latest send wins). */
export async function outreachRecipients(organizationId: string): Promise<Map<string, { leadId: string; threadId: string | null }>> {
  const sends = await prisma.outreachSend.findMany({
    where: { organizationId, isDemo: false, status: "sent", provider: { not: "test" } },
    select: { toEmail: true, leadId: true, threadId: true },
    orderBy: { sentAt: "desc" },
    take: 5000,
  });
  const map = new Map<string, { leadId: string; threadId: string | null }>();
  for (const s of sends) {
    const email = s.toEmail.toLowerCase();
    if (!map.has(email)) map.set(email, { leadId: s.leadId, threadId: s.threadId });
  }
  return map;
}

/**
 * Read new mail in the outreach mailbox and record the replies and delivery
 * failures that belong to outreach. Safe to run again: a message is recorded once.
 */
export async function readReplies(input: {
  organizationId: string;
  reader: InboxReader;
  now?: Date;
}): Promise<ReadSummary> {
  const summary: ReadSummary = { checked: 0, replies: 0, bounces: 0, ignored: 0, duplicates: 0, recorded: [] };
  const recipients = await outreachRecipients(input.organizationId);
  // Nothing was ever sent: there is nothing an incoming message could be a reply to.
  if (recipients.size === 0) return summary;

  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const known = new Set(recipients.keys());
  const { mails, skipped } = await input.reader.listUnhandled(since, PER_RUN, (head) => belongsToOutreach(head, known));
  summary.checked = mails.length;
  summary.ignored = skipped;

  for (const mail of mails) {
    const match = matchIncoming(mail, known);
    // A delivery failure about some other address: not ours, nothing to record.
    if (match.kind === "ignored") {
      summary.ignored++;
      await input.reader.markHandled(mail.uid);
      continue;
    }
    const target = recipients.get(match.email)!;
    // Second guard against recording twice, for servers that refuse the handled flag.
    const already = await prisma.outreachReply.findFirst({
      where: { organizationId: input.organizationId, leadId: target.leadId, receivedAt: mail.date },
      select: { id: true },
    });
    if (already) {
      summary.duplicates++;
      await input.reader.markHandled(mail.uid);
      continue;
    }
    const r = await recordReply({
      organizationId: input.organizationId,
      leadId: target.leadId,
      body: match.body,
      threadId: mail.inReplyTo ?? target.threadId,
      isDemo: false,
      receivedAt: mail.date,
    });
    if (match.kind === "bounce") summary.bounces++;
    else summary.replies++;
    summary.recorded.push({ leadId: target.leadId, label: r.label, needsReview: r.needsReview, suppressed: r.suppressed });
    await input.reader.markHandled(mail.uid);
  }
  return summary;
}
