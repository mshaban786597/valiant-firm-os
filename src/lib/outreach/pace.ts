/**
 * How many real outreach emails may go out. A new sending address that starts
 * at full volume lands in spam and damages its domain, so volume starts low and
 * steps up weekly. Counted from the first real email, so nothing has to be
 * configured for the warm-up to happen.
 */

type Env = Record<string, string | undefined>;

/** Default ceiling per rolling 24 hours for one mailbox. */
export const DEFAULT_DAILY_LIMIT = 20;
/** Never exceeded, whatever is configured: protects the sending domain. */
export const MAX_DAILY_LIMIT = 50;
/** Emails per scheduler run, so a day's allowance is spread out, not sent in one burst. */
export const PER_RUN_LIMIT = 5;
/** Allowance during the first, second and third week. After that: the full limit. */
export const WARMUP_STEPS = [5, 10, 15];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The configured ceiling, clamped to 1..MAX_DAILY_LIMIT. */
export function dailyLimit(env: Env = process.env): number {
  const n = Math.floor(Number(env.OUTREACH_DAILY_LIMIT));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAILY_LIMIT;
  return Math.min(n, MAX_DAILY_LIMIT);
}

/** Allowed in a rolling 24 hours, given when the very first real email went out. */
export function dailyAllowance(firstSendAt: Date | null, now: Date, limit: number): number {
  const week = firstSendAt ? Math.max(0, Math.floor((now.getTime() - firstSendAt.getTime()) / (7 * DAY_MS))) : 0;
  const step = week < WARMUP_STEPS.length ? WARMUP_STEPS[week]! : limit;
  return Math.min(step, limit);
}

/** How many more may be sent in this run. Never negative. */
export function runBudget(allowance: number, sentLast24h: number): number {
  return Math.max(0, Math.min(allowance - sentLast24h, PER_RUN_LIMIT));
}

/** Start of the rolling window the allowance is counted over. */
export function windowStart(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}
