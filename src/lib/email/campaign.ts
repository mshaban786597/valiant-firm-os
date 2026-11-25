import crypto from "node:crypto";

/**
 * Email campaigns (marketing email to people who agreed to hear from you), sent
 * through Resend. Pure helpers only: no database, no network except the one
 * sender function, which takes its fetch as an argument.
 *
 * Send safety
 *  - OFF unless EMAIL_CAMPAIGN_LIVE_SENDING="true" AND a Resend key AND a sender
 *    address on your own verified domain AND the app's public address (needed
 *    for the unsubscribe link). A key alone sends nothing.
 *  - a real email only goes to an address on EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS
 *    (comma-separated; "*" = anyone). Unset = nobody.
 *  - every email carries an unsubscribe link and one-click unsubscribe headers
 *  - addresses on the do-not-email list are skipped, never sent
 */

type Env = Record<string, string | undefined>;

/** Resend's free plan allows 100 emails a day. */
export const CAMPAIGN_DEFAULT_DAILY_LIMIT = 100;
export const CAMPAIGN_MAX_DAILY_LIMIT = 5000;
/** Emails per run: keeps one request short and stays under the provider's rate limit. */
export const CAMPAIGN_PER_RUN = 20;
/** Pause between two emails in one run (the provider allows two requests a second). */
export const CAMPAIGN_SPACING_MS = 600;

export interface CampaignSender {
  ready: true;
  apiKey: string;
  from: string;
  baseUrl: string;
  postalAddress: string | null;
  dailyLimit: number;
}
export interface CampaignSenderOff {
  ready: false;
  reason: string;
}

export function campaignDailyLimit(env: Env = process.env): number {
  const n = Math.floor(Number(env.EMAIL_CAMPAIGN_DAILY_LIMIT));
  if (!Number.isFinite(n) || n < 1) return CAMPAIGN_DEFAULT_DAILY_LIMIT;
  return Math.min(n, CAMPAIGN_MAX_DAILY_LIMIT);
}

/** Whether campaigns can really be sent, and if not, the one thing that is missing. */
export function campaignSender(env: Env = process.env): CampaignSender | CampaignSenderOff {
  if (!env.RESEND_API_KEY) return { ready: false, reason: "Resend is not connected." };
  const from = (env.EMAIL_CAMPAIGN_FROM ?? "").trim();
  if (!from) return { ready: false, reason: "No sender address is set for campaigns." };
  const baseUrl = (env.NEXTAUTH_URL ?? "").trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(baseUrl)) return { ready: false, reason: "The app's public address is not set, so unsubscribe links cannot be made." };
  if (env.EMAIL_CAMPAIGN_LIVE_SENDING !== "true") return { ready: false, reason: "Campaign sending is switched off." };
  return {
    ready: true,
    apiKey: env.RESEND_API_KEY,
    from,
    baseUrl,
    postalAddress: (env.OUTREACH_POSTAL_ADDRESS ?? "").trim() || null,
    dailyLimit: campaignDailyLimit(env),
  };
}

/** Second lock, same rule as outreach: unset list = nobody, "*" = anyone. */
export function campaignRecipientAllowed(to: string, env: Env = process.env): boolean {
  const list = (env.EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.indexOf("*") !== -1 || list.indexOf(to.trim().toLowerCase()) !== -1;
}

export type RecipientDecision = { action: "send" } | { action: "skip"; reason: string };

/** What to do with one pending recipient. Suppression always wins. */
export function decideRecipient(input: { suppressed: boolean; allowed: boolean }): RecipientDecision {
  if (input.suppressed) return { action: "skip", reason: "On the do-not-email list" };
  if (!input.allowed) return { action: "skip", reason: "Not on the allowed recipient list" };
  return { action: "send" };
}

/** How many more may be sent in this run. Never negative. */
export function campaignRunBudget(dailyLimit: number, sentLast24h: number): number {
  return Math.max(0, Math.min(dailyLimit - sentLast24h, CAMPAIGN_PER_RUN));
}

// ---- unsubscribe links ---------------------------------------------------------
function sign(recipientId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`unsubscribe:${recipientId}`).digest("base64url").slice(0, 32);
}

/** A link token for one recipient. Cannot be guessed or altered without the secret. */
export function unsubscribeToken(recipientId: string, secret: string): string {
  return `${recipientId}.${sign(recipientId, secret)}`;
}

/** The recipient id inside a valid token, or null. */
export function readUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(id, secret));
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  return id;
}

// ---- the email itself ------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escape the text, then turn web addresses into links and line breaks into <br>. */
export function textToHtml(text: string): string {
  return esc(text)
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\r?\n/g, "<br>\n");
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/** The campaign body plus the footer every marketing email must carry. */
export function renderCampaignEmail(input: { body: string; unsubscribeUrl: string; postalAddress: string | null }): RenderedEmail {
  const body = input.body.trim();
  const footerText = [input.postalAddress, `Unsubscribe: ${input.unsubscribeUrl}`].filter(Boolean).join("\n");
  const footerHtml = [
    input.postalAddress ? esc(input.postalAddress) : null,
    `<a href="${esc(input.unsubscribeUrl)}">Unsubscribe</a>`,
  ]
    .filter(Boolean)
    .join("<br>\n");
  return {
    text: `${body}\n\n--\n${footerText}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">${textToHtml(body)}</div>\n<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#666;margin-top:28px">${footerHtml}</p>`,
  };
}

// ---- sending -----------------------------------------------------------------------
export interface CampaignSendRequest {
  recipientId: string;
  to: string;
  subject: string;
  email: RenderedEmail;
  unsubscribeUrl: string;
  /** Null for a test email: there is no recipient to unsubscribe. */
  oneClickUrl: string | null;
  /** Overrides the per-recipient key. A test email uses a fresh one each time. */
  idempotencyKey?: string;
}

/** The note placed above a test email, so it is never mistaken for the real send. */
export const TEST_NOTE = "[Test email. Only you received this. The unsubscribe link works in the real campaign.]";

/** A test copy of a campaign for the owner's own inbox. */
export function buildTestEmail(
  campaign: { id: string; subject: string; body: string },
  to: string,
  sender: CampaignSender,
  now: Date = new Date(),
): CampaignSendRequest {
  const unsubscribeUrl = `${sender.baseUrl}/unsubscribe/preview`;
  return {
    recipientId: `test-${campaign.id}`,
    to,
    subject: `[Test] ${campaign.subject}`,
    email: renderCampaignEmail({ body: `${TEST_NOTE}\n\n${campaign.body}`, unsubscribeUrl, postalAddress: sender.postalAddress }),
    unsubscribeUrl,
    oneClickUrl: null,
    idempotencyKey: `campaign-test-${campaign.id}-${now.getTime()}`,
  };
}

export type CampaignReceipt =
  | { status: "accepted"; messageId: string | null }
  /** The provider refused this email. Sending it again would be refused again. */
  | { status: "rejected"; error: string }
  /** Nothing was accepted (provider busy, limit reached, no answer). Safe to try later: the key prevents a double send. */
  | { status: "retry"; error: string };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Send one campaign email through Resend. Never throws. */
export async function sendCampaignEmail(
  req: CampaignSendRequest,
  sender: CampaignSender,
  fetchImpl: FetchLike = fetch,
): Promise<CampaignReceipt> {
  let res: Response;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sender.apiKey}`,
        "content-type": "application/json",
        // Provider-side dedup: a second try for the same recipient cannot deliver twice.
        "Idempotency-Key": req.idempotencyKey ?? `campaign-recipient-${req.recipientId}`,
      },
      body: JSON.stringify({
        from: sender.from,
        to: [req.to],
        subject: req.subject,
        text: req.email.text,
        html: req.email.html,
        ...(req.oneClickUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${req.oneClickUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { status: "retry", error: "No response from the email service" };
  }
  // 409 = the same email is being sent by another run right now; 429 = a limit was reached.
  if (res.status >= 500 || res.status === 429 || res.status === 409) return { status: "retry", error: `HTTP ${res.status}` };
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const why = typeof json?.message === "string" ? json.message.slice(0, 200) : `HTTP ${res.status}`;
    return { status: "rejected", error: why };
  }
  const json = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return { status: "accepted", messageId: typeof json?.id === "string" ? json.id : null };
}

// ---- reporting -----------------------------------------------------------------------
export interface CampaignCounts {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  unsubscribed: number;
  bounced: number;
}

export const EMPTY_COUNTS: CampaignCounts = { pending: 0, sent: 0, failed: 0, skipped: 0, unsubscribed: 0, bounced: 0 };

/** Fold recipient rows grouped by status into the numbers shown on a campaign. */
export function countsFrom(groups: { status: string; count: number }[]): CampaignCounts {
  const c: CampaignCounts = { ...EMPTY_COUNTS };
  for (const g of groups) {
    if (g.status === "pending" || g.status === "sending") c.pending += g.count;
    else if (g.status === "sent") c.sent += g.count;
    else if (g.status === "failed") c.failed += g.count;
    else if (g.status === "skipped") c.skipped += g.count;
    // Both of these did receive the email first.
    else if (g.status === "unsubscribed") c.unsubscribed += g.count;
    else if (g.status === "bounced") c.bounced += g.count;
  }
  return c;
}

/** Emails that were accepted for delivery: the honest base for an open rate. */
export function deliveredBase(c: CampaignCounts): number {
  return c.sent + c.unsubscribed;
}

/** One plain line: what happened to a campaign's recipients. */
export function countsLine(c: CampaignCounts): string {
  const parts = [`${deliveredBase(c) + c.bounced} sent`];
  if (c.pending) parts.push(`${c.pending} waiting`);
  if (c.bounced) parts.push(`${c.bounced} bounced`);
  if (c.failed) parts.push(`${c.failed} refused`);
  if (c.skipped) parts.push(`${c.skipped} skipped`);
  return parts.join(" · ");
}
