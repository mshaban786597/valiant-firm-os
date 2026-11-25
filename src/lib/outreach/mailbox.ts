import crypto from "node:crypto";
import nodemailer from "nodemailer";

import type { OutreachProvider, SendReceipt, SendRequest } from "@/lib/outreach/engine";

/**
 * Outreach sent from a real mailbox over SMTP.
 *
 * Cold outreach must not go through a transactional email service (their rules
 * forbid it and the account gets closed), so it is sent the way a person would
 * send it: from a named mailbox on a domain kept separate from the main one.
 *
 * SMTP cannot be asked "did you already get this?", so this sender is marked
 * not idempotent: an unclear send is never retried automatically.
 */

type Env = Record<string, string | undefined>;

export interface MailboxConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Header form, e.g. `Muhammad <muhammad@example.org>`. */
  from: string;
  /** Bare address taken from `from`. */
  address: string;
}

const EMAIL = /[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/;

/** The mailbox settings, or null when the mailbox is not fully configured. */
export function mailboxConfig(env: Env = process.env): MailboxConfig | null {
  const user = (env.OUTREACH_SMTP_USER ?? "").trim();
  const password = env.OUTREACH_SMTP_PASSWORD ?? "";
  if (!user || !password) return null;
  const from = (env.OUTREACH_EMAIL_FROM ?? "").trim() || user;
  const address = (from.match(EMAIL) ?? user.match(EMAIL) ?? [""])[0].toLowerCase();
  if (!address) return null;
  const port = Math.floor(Number(env.OUTREACH_SMTP_PORT)) || 465;
  return { host: (env.OUTREACH_SMTP_HOST ?? "").trim() || "smtp.hostinger.com", port, user, password, from, address };
}

/** Stable Message-ID for one send, so a follow-up can thread onto the first email. */
export function messageIdFor(idempotencyKey: string, address: string): string {
  const hash = crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
  return `<${hash}@${address.split("@")[1] ?? "localhost"}>`;
}

export interface OutgoingMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  headers: Record<string, string>;
}

/** Pure: the message exactly as it is handed to the mail server. */
export function buildMail(req: SendRequest, cfg: MailboxConfig): OutgoingMail {
  const messageId = messageIdFor(req.idempotencyKey, cfg.address);
  const parent = req.threadId && req.threadId !== messageId && req.threadId.startsWith("<") ? req.threadId : undefined;
  return {
    from: cfg.from,
    to: req.to,
    subject: req.subject,
    text: req.body,
    messageId,
    ...(parent ? { inReplyTo: parent, references: parent } : {}),
    // Lets a mail app show its own "unsubscribe" button; the reply is read and honoured.
    headers: { "List-Unsubscribe": `<mailto:${cfg.address}?subject=unsubscribe>` },
  };
}

/** The slice of a mail transport this module needs (nodemailer's, or a fake in tests). */
export interface MailTransport {
  sendMail(mail: OutgoingMail): Promise<{ messageId?: string; accepted?: unknown[]; rejected?: unknown[] }>;
  verify?(): Promise<unknown>;
}

function realTransport(cfg: MailboxConfig): MailTransport {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }) as unknown as MailTransport;
}

/** Errors that prove the message never reached the server's queue. */
const NEVER_SENT = new Set(["EAUTH", "ECONNECTION", "EDNS", "EENVELOPE", "ECONNREFUSED", "ENOTFOUND"]);

/** Pure: turn a transport failure into a receipt. Unknown failures stay unclear. */
export function receiptForError(err: unknown): SendReceipt {
  const e = (err ?? {}) as { code?: string; responseCode?: number };
  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) {
    return { status: "rejected", error: "Mailbox sign-in failed" };
  }
  if (typeof e.responseCode === "number" && e.responseCode >= 400) {
    return { status: "rejected", error: `Mail server refused it (${e.responseCode})` };
  }
  if (e.code && NEVER_SENT.has(e.code)) {
    return { status: "rejected", error: `Could not reach the mail server (${e.code})` };
  }
  return { status: "ambiguous", error: "No clear answer from the mail server" };
}

export function mailboxProvider(env: Env = process.env, transport?: MailTransport): OutreachProvider {
  return {
    name: "mailbox",
    idempotent: false,
    async send(req) {
      const cfg = mailboxConfig(env);
      if (!cfg) return { status: "rejected", error: "Outreach mailbox is not configured" };
      const mail = buildMail(req, cfg);
      try {
        const info = await (transport ?? realTransport(cfg)).sendMail(mail);
        if (info.rejected && info.rejected.length > 0) {
          return { status: "rejected", error: "Mail server refused the recipient" };
        }
        // The first email's own id is the thread; follow-ups keep pointing at it.
        return { status: "accepted", messageId: mail.messageId, threadId: mail.inReplyTo ?? mail.messageId };
      } catch (err) {
        return receiptForError(err);
      }
    },
  };
}

/** Sign in to the mailbox without sending anything. Used by the Integrations "Test" button. */
export async function testMailbox(env: Env = process.env, transport?: MailTransport): Promise<{ ok: boolean; detail: string }> {
  const cfg = mailboxConfig(env);
  if (!cfg) return { ok: false, detail: "Not configured: set OUTREACH_SMTP_USER and OUTREACH_SMTP_PASSWORD." };
  try {
    const t = transport ?? realTransport(cfg);
    if (!t.verify) return { ok: false, detail: "This mail transport cannot be verified." };
    await t.verify();
    return { ok: true, detail: `Signed in to ${cfg.host} as ${cfg.address}. Nothing was sent.` };
  } catch (err) {
    return { ok: false, detail: receiptForError(err).error ?? "Sign-in failed" };
  }
}
