import crypto from "node:crypto";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  DEFAULT_FOLLOW_UP_GAPS,
  SUPPRESS_LABELS,
  STOP_LABELS,
  classifyReply,
  planFollowUps,
  sendDecision,
  sendIdempotencyKey,
  type ReplyLabel,
} from "@/lib/outreach/sequence";

/**
 * Outreach engine: sequence scheduling, guarded sending, replies and meetings.
 *
 * Send safety
 *  - one row per (lead, step) via a unique idempotency key: replays never add sends
 *  - each send is claimed with compare-and-set (scheduled → sending) so two
 *    workers can never both send it
 *  - suppression, replies and bookings are rechecked immediately before sending
 *  - an ambiguous provider response becomes `needs_reconcile` and is never
 *    blindly retried; reconciling re-uses the same idempotency key
 *  - demo-scope sends only ever use the test provider
 */

// ---- providers ---------------------------------------------------------------
export interface SendRequest {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
  threadId?: string | null;
}
export interface SendReceipt {
  status: "accepted" | "rejected" | "ambiguous";
  messageId?: string;
  threadId?: string;
  error?: string;
}
export interface OutreachProvider {
  name: string;
  send(req: SendRequest): Promise<SendReceipt>;
}

/** Deterministic fixture provider: no network, the same key always yields the same receipt. */
export const testProvider: OutreachProvider = {
  name: "test",
  async send(req) {
    const h = crypto.createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 16);
    return { status: "accepted", messageId: `test-msg-${h}`, threadId: req.threadId ?? `test-thread-${h}` };
  },
};

export function resendProvider(env: Record<string, string | undefined> = process.env): OutreachProvider {
  return {
    name: "resend",
    async send(req) {
      let res: Response;
      try {
        res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            "content-type": "application/json",
            // Provider-side dedup: reconciling with the same key cannot double-send.
            "Idempotency-Key": req.idempotencyKey,
          },
          body: JSON.stringify({
            from: env.OUTREACH_EMAIL_FROM || env.ALERT_EMAIL_FROM || "Valiant Firm <onboarding@resend.dev>",
            to: [req.to],
            subject: req.subject,
            text: req.body,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // We do not know whether the provider received it.
        return { status: "ambiguous", error: "No response from provider" };
      }
      if (res.status >= 500) return { status: "ambiguous", error: `HTTP ${res.status}` };
      if (!res.ok) return { status: "rejected", error: `HTTP ${res.status}` };
      const json = (await res.json().catch(() => null)) as { id?: string } | null;
      return { status: "accepted", messageId: json?.id, threadId: req.threadId ?? json?.id };
    },
  };
}

/**
 * Real outreach email is OFF unless it is switched on explicitly:
 * OUTREACH_LIVE_SENDING="true" AND a sender key. A sender key alone sends nothing.
 */
export function liveSendingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OUTREACH_LIVE_SENDING === "true" && !!env.RESEND_API_KEY;
}

/**
 * Second lock: a real email only goes to an address on
 * OUTREACH_ALLOWED_RECIPIENTS (comma-separated; "*" = anyone). With the list
 * unset, no real recipient is allowed — so no client can be emailed by accident.
 */
export function recipientAllowed(to: string, env: Record<string, string | undefined> = process.env): boolean {
  const list = (env.OUTREACH_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.indexOf("*") !== -1 || list.indexOf(to.trim().toLowerCase()) !== -1;
}

/** Demo scope → test provider only. Live scope → Resend only when live sending is switched on. */
export function providerFor(
  isDemo: boolean,
  env: Record<string, string | undefined> = process.env,
): OutreachProvider | null {
  if (isDemo) return testProvider;
  return liveSendingEnabled(env) ? resendProvider(env) : null;
}

// ---- sequence ------------------------------------------------------------------
export interface StartSequenceInput {
  organizationId: string;
  leadId: string;
  toEmail: string;
  subject: string;
  body: string;
  approvalId?: string | null;
  isDemo: boolean;
  now?: Date;
  timeZone?: string;
  followUpGaps?: number[];
}

/** Create the first email and its follow-ups. Safe to call twice: nothing is duplicated. */
export async function startSequence(input: StartSequenceInput): Promise<{ created: number }> {
  const now = input.now ?? new Date();
  const followUps = planFollowUps(now, input.followUpGaps ?? DEFAULT_FOLLOW_UP_GAPS, input.timeZone);
  const rows = [now, ...followUps].map((when, step) => ({
    organizationId: input.organizationId,
    leadId: input.leadId,
    step,
    status: "scheduled",
    scheduledFor: when,
    toEmail: input.toEmail,
    subject: step === 0 ? input.subject : `Re: ${input.subject}`,
    body:
      step === 0
        ? input.body
        : step === 1
          ? "Following up on my note below in case it got buried. Happy to send the short audit either way."
          : "Last note from me. If the timing is off I will leave it here; the offer of the audit stands.",
    approvalId: input.approvalId ?? null,
    idempotencyKey: sendIdempotencyKey(input.leadId, step),
    isDemo: input.isDemo,
  }));
  const res = await prisma.outreachSend.createMany({ data: rows, skipDuplicates: true });
  return { created: res.count };
}

async function cancelPending(leadId: string, reason: string): Promise<number> {
  const res = await prisma.outreachSend.updateMany({
    where: { leadId, status: "scheduled" },
    data: { status: "canceled", cancelReason: reason },
  });
  return res.count;
}

export interface ProcessSummary {
  due: number;
  sent: number;
  canceled: number;
  failed: number;
  needsReconcile: number;
  skippedNoProvider: number;
  /** Held because the recipient is not on the allowed list (real sender only). */
  heldNotAllowed: number;
}

/**
 * Send everything that is due. Each send is rechecked, claimed, sent and
 * recorded. Restart-safe: an interrupted run leaves rows either still
 * `scheduled` (picked up next time) or `sending` (surfaced for reconcile).
 */
export async function processDueSends(input: {
  organizationId: string;
  isDemo: boolean;
  now?: Date;
  provider?: OutreachProvider | null;
  /** Test hook: stop after claiming N sends, simulating a worker restart. */
  crashAfterClaims?: number;
}): Promise<ProcessSummary> {
  const now = input.now ?? new Date();
  const provider = input.provider === undefined ? providerFor(input.isDemo) : input.provider;
  const summary: ProcessSummary = { due: 0, sent: 0, canceled: 0, failed: 0, needsReconcile: 0, skippedNoProvider: 0, heldNotAllowed: 0 };

  const due = await prisma.outreachSend.findMany({
    where: {
      organizationId: input.organizationId,
      isDemo: input.isDemo,
      status: "scheduled",
      scheduledFor: { lte: now },
    },
    orderBy: [{ scheduledFor: "asc" }, { step: "asc" }],
    take: 200,
  });
  summary.due = due.length;
  let claims = 0;

  for (const send of due) {
    // Recheck suppression, replies and bookings immediately before sending.
    const [suppressed, replies, meeting] = await Promise.all([
      prisma.suppression.findFirst({
        where: { organizationId: input.organizationId, email: send.toEmail.toLowerCase() },
        select: { id: true },
      }),
      prisma.outreachReply.findMany({ where: { leadId: send.leadId }, select: { label: true } }),
      prisma.meeting.findFirst({
        where: { leadId: send.leadId, status: { in: ["confirmed", "rescheduled", "attended"] } },
        select: { id: true },
      }),
    ]);
    const decision = sendDecision({
      toEmail: send.toEmail,
      suppressed: !!suppressed,
      replyLabels: replies.map((r) => r.label as ReplyLabel),
      hasActiveMeeting: !!meeting,
    });
    if (!decision.send) {
      const c = await prisma.outreachSend.updateMany({
        where: { id: send.id, status: "scheduled" },
        data: { status: "canceled", cancelReason: decision.cancelReason },
      });
      summary.canceled += c.count;
      continue;
    }
    if (!provider) {
      summary.skippedNoProvider++;
      continue; // stays scheduled; nothing is claimed or faked
    }
    // Real sender: the recipient must be explicitly allowed. Otherwise hold it.
    if (provider.name !== "test" && !recipientAllowed(send.toEmail)) {
      summary.heldNotAllowed++;
      continue;
    }

    // Claim: only one worker can move scheduled → sending.
    const claim = await prisma.outreachSend.updateMany({
      where: { id: send.id, status: "scheduled" },
      data: { status: "sending", provider: provider.name },
    });
    if (claim.count === 0) continue;
    claims++;
    if (input.crashAfterClaims !== undefined && claims >= input.crashAfterClaims) {
      throw new Error("Simulated worker restart after claim");
    }

    const receipt = await provider.send({
      to: send.toEmail,
      subject: send.subject,
      body: send.body,
      idempotencyKey: send.idempotencyKey,
      threadId: send.threadId,
    });
    await applyReceipt(send.id, send.leadId, send.step, receipt, now);
    if (receipt.status === "accepted") summary.sent++;
    else if (receipt.status === "rejected") summary.failed++;
    else summary.needsReconcile++;
  }
  return summary;
}

async function applyReceipt(sendId: string, leadId: string, step: number, receipt: SendReceipt, now: Date) {
  if (receipt.status === "accepted") {
    await prisma.outreachSend.update({
      where: { id: sendId },
      data: {
        status: "sent",
        sentAt: now,
        providerMessageId: receipt.messageId ?? null,
        threadId: receipt.threadId ?? null,
      },
    });
    // Follow-ups stay in the same thread.
    if (receipt.threadId) {
      await prisma.outreachSend.updateMany({
        where: { leadId, status: "scheduled", threadId: null },
        data: { threadId: receipt.threadId },
      });
    }
    if (step === 0) {
      await prisma.lead.updateMany({
        where: { id: leadId, sequenceStartedAt: null },
        data: { sequenceStartedAt: now, status: LeadStatus.InSequence },
      });
    }
    return;
  }
  await prisma.outreachSend.update({
    where: { id: sendId },
    data: {
      status: receipt.status === "rejected" ? "failed" : "needs_reconcile",
      cancelReason: receipt.error ?? null,
    },
  });
}

/**
 * Reconcile sends left `sending` (worker restart) or `needs_reconcile`
 * (ambiguous response) by asking the provider again with the SAME idempotency
 * key, so the email cannot go out twice.
 */
export async function reconcileSends(input: {
  organizationId: string;
  isDemo: boolean;
  now?: Date;
  provider?: OutreachProvider | null;
}): Promise<{ reconciled: number; stillAmbiguous: number }> {
  const now = input.now ?? new Date();
  const provider = input.provider === undefined ? providerFor(input.isDemo) : input.provider;
  const stuck = await prisma.outreachSend.findMany({
    where: {
      organizationId: input.organizationId,
      isDemo: input.isDemo,
      status: { in: ["sending", "needs_reconcile"] },
    },
    take: 100,
  });
  let reconciled = 0;
  let stillAmbiguous = 0;
  for (const send of stuck) {
    if (!provider || (provider.name !== "test" && !recipientAllowed(send.toEmail))) {
      stillAmbiguous++;
      continue;
    }
    const receipt = await provider.send({
      to: send.toEmail,
      subject: send.subject,
      body: send.body,
      idempotencyKey: send.idempotencyKey,
      threadId: send.threadId,
    });
    await applyReceipt(send.id, send.leadId, send.step, receipt, now);
    if (receipt.status === "ambiguous") stillAmbiguous++;
    else reconciled++;
  }
  return { reconciled, stillAmbiguous };
}

// ---- replies -------------------------------------------------------------------
export async function recordReply(input: {
  organizationId: string;
  leadId: string;
  body: string;
  threadId?: string | null;
  isDemo: boolean;
  receivedAt?: Date;
}): Promise<{ replyId: string; label: ReplyLabel; needsReview: boolean; canceledFollowUps: number; suppressed: boolean }> {
  const { label, needsReview } = classifyReply(input.body);
  const reply = await prisma.outreachReply.create({
    data: {
      organizationId: input.organizationId,
      leadId: input.leadId,
      threadId: input.threadId ?? null,
      label,
      needsReview,
      body: input.body,
      receivedAt: input.receivedAt ?? new Date(),
      isDemo: input.isDemo,
    },
  });

  let canceled = 0;
  if (STOP_LABELS.indexOf(label) !== -1) {
    canceled = await cancelPending(input.leadId, `Prospect replied (${label})`);
  }

  let suppressed = false;
  const reason = SUPPRESS_LABELS[label];
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, select: { email: true } });
  if (reason && lead?.email) {
    await prisma.suppression.upsert({
      where: { organizationId_email: { organizationId: input.organizationId, email: lead.email.toLowerCase() } },
      create: {
        organizationId: input.organizationId,
        email: lead.email.toLowerCase(),
        reason,
        source: `reply:${reply.id}`,
      },
      update: {},
    });
    suppressed = true;
  }

  if (label === "interested" || label === "question") {
    await prisma.lead.updateMany({
      where: { id: input.leadId },
      data: { manualReplied: true, status: LeadStatus.Replied },
    });
  }

  await writeAuditLog({
    organizationId: input.organizationId,
    action: "outreach.reply",
    entity: "OutreachReply",
    entityId: reply.id,
    meta: { label, needsReview, canceledFollowUps: canceled, suppressed },
  });
  return { replyId: reply.id, label, needsReview, canceledFollowUps: canceled, suppressed };
}

// ---- meetings ------------------------------------------------------------------
/**
 * Record a calendar event. A meeting only exists once the calendar source
 * reports it; cancels and reschedules update the same row (unique per source
 * event id), so they never create an extra meeting.
 */
export async function recordMeetingEvent(input: {
  organizationId: string;
  leadId?: string | null;
  calendarSource: string;
  externalEventId: string;
  status: "confirmed" | "rescheduled" | "canceled" | "attended" | "no_show";
  startsAt: Date;
  summary?: string | null;
  isDemo: boolean;
}): Promise<{ meetingId: string; created: boolean; canceledFollowUps: number }> {
  const key = {
    organizationId_calendarSource_externalEventId: {
      organizationId: input.organizationId,
      calendarSource: input.calendarSource,
      externalEventId: input.externalEventId,
    },
  };
  const existing = await prisma.meeting.findUnique({ where: key, select: { id: true } });
  const meeting = await prisma.meeting.upsert({
    where: key,
    create: {
      organizationId: input.organizationId,
      leadId: input.leadId ?? null,
      calendarSource: input.calendarSource,
      externalEventId: input.externalEventId,
      status: input.status,
      startsAt: input.startsAt,
      summary: input.summary ?? null,
      isDemo: input.isDemo,
    },
    update: {
      status: input.status,
      startsAt: input.startsAt,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
    },
  });

  let canceledFollowUps = 0;
  if (input.leadId && (input.status === "confirmed" || input.status === "rescheduled")) {
    canceledFollowUps = await cancelPending(input.leadId, "Meeting booked");
    await prisma.lead.updateMany({
      where: { id: input.leadId },
      data: { manualBooked: true, status: LeadStatus.CallBooked },
    });
  }
  await writeAuditLog({
    organizationId: input.organizationId,
    action: `meeting.${input.status}`,
    entity: "Meeting",
    entityId: meeting.id,
    meta: { calendarSource: input.calendarSource, created: !existing },
  });
  return { meetingId: meeting.id, created: !existing, canceledFollowUps };
}

// ---- metrics -------------------------------------------------------------------
export interface SalesMetrics {
  discovered: number;
  qualified: number;
  confirmedSends: number;
  positiveReplies: number;
  confirmedMeetings: number;
  attendedMeetings: number;
  wins: number;
  wonMonthlyRevenue: number;
}

/** Sales funnel from persisted records only. Opens are not counted (optional signal). */
export async function salesMetrics(organizationId: string, isDemo: boolean): Promise<SalesMetrics> {
  const scoped = { organizationId, isDemo };
  const [discovered, qualified, confirmedSends, positiveReplies, confirmedMeetings, attendedMeetings, wonDeals] =
    await Promise.all([
      prisma.lead.count({ where: scoped }),
      prisma.lead.count({
        where: { ...scoped, OR: [{ leadScore: { gte: 65 } }, { status: { notIn: [LeadStatus.Raw, LeadStatus.Archived] } }] },
      }),
      prisma.outreachSend.count({ where: { ...scoped, status: "sent" } }),
      prisma.outreachReply.count({ where: { ...scoped, label: "interested" } }),
      prisma.meeting.count({ where: { ...scoped, status: { in: ["confirmed", "rescheduled", "attended"] } } }),
      prisma.meeting.count({ where: { ...scoped, status: "attended" } }),
      prisma.deal.findMany({ where: { ...scoped, stage: "ClosedWon" }, select: { monthlyValue: true } }),
    ]);
  return {
    discovered,
    qualified,
    confirmedSends,
    positiveReplies,
    confirmedMeetings,
    attendedMeetings,
    wins: wonDeals.length,
    wonMonthlyRevenue: wonDeals.reduce((s, d) => s + Number(d.monthlyValue ?? 0), 0),
  };
}
