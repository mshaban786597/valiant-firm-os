/**
 * Pure outreach-sequence rules: business-day scheduling, reply classification,
 * the pre-send decision and prospect deduplication. No DB, no network.
 */

// ---- business days ---------------------------------------------------------
function weekdayIn(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Add N business days (Mon–Fri in the business timezone), keeping the time of day. */
export function addBusinessDays(from: Date, days: number, timeZone = "America/Chicago"): Date {
  let d = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + 86_400_000);
    const wd = weekdayIn(d, timeZone);
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/** Blueprint default: follow up after 4 business days, then 5 more. */
export const DEFAULT_FOLLOW_UP_GAPS = [4, 5];

export function planFollowUps(
  firstSentAt: Date,
  gaps: number[] = DEFAULT_FOLLOW_UP_GAPS,
  timeZone = "America/Chicago",
): Date[] {
  const out: Date[] = [];
  let cursor = firstSentAt;
  gaps.forEach((gap) => {
    cursor = addBusinessDays(cursor, gap, timeZone);
    out.push(cursor);
  });
  return out;
}

// ---- reply classification ----------------------------------------------------
export type ReplyLabel =
  | "interested"
  | "question"
  | "later"
  | "not_interested"
  | "wrong_contact"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "needs_review";

export const REPLY_LABELS: Record<ReplyLabel, string> = {
  interested: "Interested",
  question: "Question",
  later: "Later",
  not_interested: "Not Interested",
  wrong_contact: "Wrong Contact / Referral",
  out_of_office: "Out of Office",
  unsubscribe: "Unsubscribe",
  bounce: "Bounce",
  needs_review: "Needs Review",
};

const RULES: { label: ReplyLabel; re: RegExp }[] = [
  { label: "bounce", re: /(mailer-daemon|undeliverable|delivery (status notification|has failed|failure)|address not found|mailbox (unavailable|full)|550 5\.)/i },
  { label: "unsubscribe", re: /(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|opt[- ]?out|do not (email|contact))/i },
  { label: "out_of_office", re: /(out of (the )?office|on (vacation|leave|holiday)|auto[- ]?reply|automatic reply|away until|limited access to email)/i },
  { label: "wrong_contact", re: /(wrong (person|contact)|not the right (person|contact)|no longer (with|works)|(reach out to|contact|email|speak (to|with)) .{1,40} instead|i'?m not the one)/i },
  { label: "not_interested", re: /(not interested|no thanks|no thank you|we'?re (all set|good)|already have (someone|an agency|a provider)|don'?t need|please don'?t)/i },
  { label: "later", re: /(next (quarter|month|year)|circle back|check back|reach out (again )?in|not (right )?now|later this (year|month)|after the (season|holidays)|too busy right now)/i },
  { label: "interested", re: /(i'?m interested|we'?re interested|sounds (good|great|interesting)|let'?s (talk|chat|set up)|set up a (call|time|meeting)|schedule a (call|time)|would love to|yes,? please|send (me )?(more|the) (info|details|audit)|book a (call|time))/i },
  { label: "question", re: /(\?|how much|what (does|would|is)|pricing|price|cost)/i },
];

const COMMERCIAL = /(how much|pricing|price|cost|contract|discount|guarantee|quote|proposal)/i;

/**
 * Rule-based reply label. Ambiguous replies (conflicting signals, or no signal)
 * and commercial decisions are flagged for the owner instead of being acted on.
 */
export function classifyReply(text: string): { label: ReplyLabel; needsReview: boolean } {
  const body = text.trim();
  if (!body) return { label: "needs_review", needsReview: true };
  const hits = RULES.filter((r) => r.re.test(body)).map((r) => r.label);
  if (hits.length === 0) return { label: "needs_review", needsReview: true };

  // Hard signals win outright.
  for (const hard of ["bounce", "unsubscribe", "out_of_office", "wrong_contact"] as ReplyLabel[]) {
    if (hits.indexOf(hard) !== -1) return { label: hard, needsReview: false };
  }
  const positive = hits.indexOf("interested") !== -1;
  const negative = hits.indexOf("not_interested") !== -1;
  if (positive && negative) return { label: "needs_review", needsReview: true };
  if (negative) return { label: "not_interested", needsReview: false };
  if (hits.indexOf("later") !== -1 && !positive) return { label: "later", needsReview: false };
  const commercial = COMMERCIAL.test(body);
  if (positive) return { label: "interested", needsReview: commercial };
  return { label: "question", needsReview: commercial };
}

/** Labels after which no further automated email may go out. */
export const STOP_LABELS: ReplyLabel[] = [
  "interested",
  "question",
  "later",
  "not_interested",
  "wrong_contact",
  "unsubscribe",
  "bounce",
  "needs_review",
];

/** Labels that also add the address to the suppression list. */
export const SUPPRESS_LABELS: Partial<Record<ReplyLabel, string>> = {
  unsubscribe: "unsubscribe",
  bounce: "bounce",
  not_interested: "not_interested",
};

// ---- pre-send decision ---------------------------------------------------------
export interface SendContext {
  toEmail: string | null;
  suppressed: boolean;
  replyLabels: ReplyLabel[];
  hasActiveMeeting: boolean;
}

/** Rechecked immediately before every send. */
export function sendDecision(ctx: SendContext): { send: true } | { send: false; cancelReason: string } {
  if (!ctx.toEmail) return { send: false, cancelReason: "No email address" };
  if (ctx.suppressed) return { send: false, cancelReason: "Address is suppressed (opt-out or bounce)" };
  if (ctx.hasActiveMeeting) return { send: false, cancelReason: "Meeting already booked" };
  const stop = ctx.replyLabels.filter((l) => STOP_LABELS.indexOf(l) !== -1)[0];
  if (stop) return { send: false, cancelReason: `Prospect replied (${REPLY_LABELS[stop]})` };
  return { send: true };
}

// ---- deduplication --------------------------------------------------------------
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\b(llc|inc|co|company|corp|ltd)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Same business + same city/state = duplicate. The same brand in a different
 * city is a legitimate branch and gets its own key.
 */
export function leadDedupeKey(lead: { businessName: string; city?: string | null; state?: string | null }): string {
  return [norm(lead.businessName), norm(lead.city), norm(lead.state)].join("|");
}

/** Deterministic idempotency key: one send per lead per step. */
export function sendIdempotencyKey(leadId: string, step: number): string {
  return `outreach:${leadId}:${step}`;
}
