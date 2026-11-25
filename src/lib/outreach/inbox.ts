import { mailboxConfig } from "@/lib/outreach/mailbox";

/**
 * Reading replies from the outreach mailbox.
 *
 * The mailbox may be a person's everyday mailbox, so the rule is strict: only
 * the sender and subject of a message are looked at first, and the content is
 * opened only when the message belongs to outreach (it comes from an address an
 * outreach email was sent to, or it is a delivery failure). Every other message
 * is left exactly as it is: not opened, not marked, not stored.
 */

type Env = Record<string, string | undefined>;

/** What is known about a message before it is opened. */
export interface MailHead {
  from: string;
  subject: string;
}

export interface IncomingMail extends MailHead {
  /** Server id of the message inside the inbox. */
  uid: number;
  text: string;
  date: Date;
  messageId?: string;
  inReplyTo?: string;
}

/** The slice of a mailbox this module needs (IMAP in production, a fake in tests). */
export interface InboxReader {
  /**
   * Messages received since the given date that `wants` accepts and that were
   * not handled before. `skipped` counts the messages `wants` turned down.
   */
  listUnhandled(since: Date, limit: number, wants: (head: MailHead) => boolean): Promise<{ mails: IncomingMail[]; skipped: number }>;
  markHandled(uid: number): Promise<void>;
  close(): Promise<void>;
}

export const HANDLED_FLAG = "$VFHandled";

const DELIVERY_FAILURE_FROM = /(mailer-daemon|postmaster|mail delivery (sub)?system)/i;
const DELIVERY_FAILURE_SUBJECT = /(undeliver|delivery (status notification|has failed|failure)|returned mail|failure notice)/i;

/** Pure: the bare address in a From header, lower-cased. */
export function fromAddress(from: string): string {
  return (from.match(/[^\s<>"]+@[^\s<>"]+/) ?? [""])[0].toLowerCase();
}

/** Pure: does this look like a mail server reporting a failed delivery? */
export function isDeliveryFailure(head: MailHead): boolean {
  return DELIVERY_FAILURE_FROM.test(head.from) || DELIVERY_FAILURE_SUBJECT.test(head.subject);
}

/** Pure: may this message be opened? Only a reply from one of our recipients, or a delivery failure. */
export function belongsToOutreach(head: MailHead, recipients: ReadonlySet<string>): boolean {
  return isDeliveryFailure(head) || recipients.has(fromAddress(head.from));
}

/** Lines that start the quoted copy of our own email in a reply. */
const QUOTE_START = [
  /^\s*On .{5,200}wrote:\s*$/i,
  /^\s*-{2,}\s*(original|forwarded) message\s*-{2,}/i,
  /^\s*_{5,}\s*$/,
  /^\s*From:\s.+$/i,
  /^\s*Sent from my /i,
  /^\s*>/,
];

/**
 * Pure: the part of a reply the person actually wrote. The quoted copy of our
 * email must go, or its own "reply unsubscribe" line would be read as theirs.
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (QUOTE_START.some((re) => re.test(line))) break;
    kept.push(line);
  }
  return kept.join("\n").trim().slice(0, 10_000);
}

export type InboxMatch =
  | { kind: "reply"; email: string; body: string }
  | { kind: "bounce"; email: string; body: string }
  | { kind: "ignored" };

/** Pure: decide what an incoming message is, given the addresses outreach was sent to. */
export function matchIncoming(mail: Pick<IncomingMail, "from" | "subject" | "text">, recipients: Iterable<string>): InboxMatch {
  const known = new Set(Array.from(recipients, (r) => r.toLowerCase()));
  const from = fromAddress(mail.from);

  if (isDeliveryFailure(mail)) {
    const text = mail.text.toLowerCase();
    const email = Array.from(known).find((r) => text.includes(r));
    return email
      ? { kind: "bounce", email, body: `Delivery failure reported by the mail server (mailer-daemon): undeliverable to ${email}.` }
      : { kind: "ignored" };
  }
  if (from && known.has(from)) {
    const body = stripQuoted(mail.text);
    // Nothing written above the quote (for example an empty forward): keep a marker so a person looks at it.
    return { kind: "reply", email: from, body: body || "(The reply had no text above the quoted email.)" };
  }
  return { kind: "ignored" };
}

export interface ImapSettings {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** IMAP settings for the outreach mailbox, or null when the mailbox is not configured. */
export function imapSettings(env: Env = process.env): ImapSettings | null {
  const cfg = mailboxConfig(env);
  if (!cfg) return null;
  return {
    host: (env.OUTREACH_IMAP_HOST ?? "").trim() || "imap.hostinger.com",
    port: Math.floor(Number(env.OUTREACH_IMAP_PORT)) || 993,
    user: cfg.user,
    password: cfg.password,
  };
}

/** Open the real inbox. Imported lazily so nothing else loads the mail libraries. */
export async function openInbox(env: Env = process.env): Promise<InboxReader | null> {
  const s = imapSettings(env);
  if (!s) return null;
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({
    host: s.host,
    port: s.port,
    secure: true,
    auth: { user: s.user, pass: s.password },
    logger: false,
    socketTimeout: 30_000,
  });
  // The library reports connection trouble as an event; unheard, it would stop the whole server.
  client.on("error", () => undefined);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
  } catch (err) {
    client.close();
    throw err;
  }

  return {
    async listUnhandled(since, limit, wants) {
      const found = await client.search({ since }, { uid: true });
      const uids = found || [];
      if (uids.length === 0) return { mails: [], skipped: 0 };

      // Sender and subject only. Nothing is opened at this step.
      const wanted: number[] = [];
      let skipped = 0;
      for await (const msg of client.fetch(uids, { envelope: true, flags: true }, { uid: true })) {
        if (msg.flags?.has(HANDLED_FLAG)) continue;
        const sender = msg.envelope?.from?.[0];
        const head: MailHead = {
          from: sender ? `${sender.name ?? ""} <${sender.address ?? ""}>` : "",
          subject: msg.envelope?.subject ?? "",
        };
        if (wants(head)) wanted.push(msg.uid);
        else skipped++;
      }

      const mails: IncomingMail[] = [];
      for (const uid of wanted.slice(0, limit)) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        mails.push({
          uid,
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          text: parsed.text ?? "",
          date: parsed.date ?? new Date(),
          messageId: parsed.messageId ?? undefined,
          inReplyTo: parsed.inReplyTo ?? undefined,
        });
      }
      return { mails, skipped };
    },
    async markHandled(uid) {
      // Some servers refuse custom flags; duplicates are also prevented in the database.
      await client.messageFlagsAdd(String(uid), [HANDLED_FLAG], { uid: true }).catch(() => undefined);
    },
    async close() {
      await client.logout().catch(() => undefined);
    },
  };
}
