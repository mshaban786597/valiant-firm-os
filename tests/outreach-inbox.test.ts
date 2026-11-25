import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, recordReply } = vi.hoisted(() => ({
  db: {
    outreachSend: { findMany: vi.fn() },
    outreachReply: { findFirst: vi.fn() },
  },
  recordReply: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/outreach/engine", () => ({ recordReply }));

import { belongsToOutreach, imapSettings, matchIncoming, stripQuoted, type IncomingMail, type InboxReader, type MailHead } from "@/lib/outreach/inbox";
import { readReplies } from "@/lib/outreach/read-replies";
import { classifyReply } from "@/lib/outreach/sequence";

const OUR_EMAIL = [
  "Hi Dana,",
  "I looked at your site and have one idea.",
  'Not interested? Reply "unsubscribe" and you will not hear from us again.',
].join("\n");

const quoted = (reply: string) =>
  `${reply}\n\nOn Tue, Nov 24, 2026 at 9:14 AM Sam Lee <sam@outreach.example> wrote:\n${OUR_EMAIL.split("\n").map((l) => `> ${l}`).join("\n")}`;

describe("reading a reply", () => {
  it("keeps only what the person wrote", () => {
    expect(stripQuoted(quoted("Sounds good, let us set up a call."))).toBe("Sounds good, let us set up a call.");
    expect(stripQuoted("Sounds good\n\n-----Original Message-----\nFrom: Sam")).toBe("Sounds good");
    expect(stripQuoted("Thanks\n\nSent from my iPhone")).toBe("Thanks");
    expect(stripQuoted("Line one\r\nLine two")).toBe("Line one\nLine two");
  });

  it("does not mistake the quoted unsubscribe line for an opt-out", () => {
    const raw = quoted("Sounds good, let us set up a call.");
    // Read whole, the quoted footer would make this an unsubscribe.
    expect(classifyReply(raw).label).toBe("unsubscribe");
    expect(classifyReply(stripQuoted(raw)).label).toBe("interested");
  });

  it("still honours a real opt-out", () => {
    expect(classifyReply(stripQuoted(quoted("Please remove me from your list."))).label).toBe("unsubscribe");
  });
});

describe("deciding what an incoming message is", () => {
  const recipients = ["owner@prospect.example", "info@bakery.example"];

  it("accepts a reply from an address outreach was sent to", () => {
    const m = matchIncoming({ from: "Dana Ruiz <Owner@Prospect.example>", subject: "Re: Quick idea", text: quoted("Tell me more") }, recipients);
    expect(m).toEqual({ kind: "reply", email: "owner@prospect.example", body: "Tell me more" });
  });

  it("ignores mail from anyone else", () => {
    expect(matchIncoming({ from: "newsletter@shop.example", subject: "Sale", text: "50% off" }, recipients)).toEqual({ kind: "ignored" });
    expect(matchIncoming({ from: "", subject: "", text: "" }, recipients)).toEqual({ kind: "ignored" });
  });

  it("recognises a delivery failure for one of our addresses", () => {
    const m = matchIncoming(
      {
        from: "Mail Delivery System <MAILER-DAEMON@mail.example>",
        subject: "Undelivered Mail Returned to Sender",
        text: "<info@bakery.example>: host mx.bakery.example said: 550 5.1.1 User unknown",
      },
      recipients,
    );
    expect(m.kind).toBe("bounce");
    expect(m.kind === "bounce" && m.email).toBe("info@bakery.example");
    expect(m.kind === "bounce" && classifyReply(m.body).label).toBe("bounce");
  });

  it("ignores a delivery failure for an address that is not ours", () => {
    const m = matchIncoming({ from: "MAILER-DAEMON@mail.example", subject: "Delivery failure", text: "<someone@else.example>: unknown" }, recipients);
    expect(m).toEqual({ kind: "ignored" });
  });

  it("keeps a marker when a reply has no text of its own", () => {
    const m = matchIncoming({ from: "owner@prospect.example", subject: "Re:", text: "> quoted only" }, recipients);
    expect(m).toMatchObject({ kind: "reply", body: "(The reply had no text above the quoted email.)" });
  });
});

describe("which messages may be opened", () => {
  const known = new Set(["owner@prospect.example"]);
  it("allows a reply from an address outreach was sent to", () => {
    expect(belongsToOutreach({ from: "Dana <Owner@Prospect.example>", subject: "Re: Quick idea" }, known)).toBe(true);
  });
  it("allows a delivery failure, which has to be opened to see whose address failed", () => {
    expect(belongsToOutreach({ from: "MAILER-DAEMON@mail.example", subject: "Undelivered Mail Returned to Sender" }, known)).toBe(true);
  });
  it("refuses everything else", () => {
    expect(belongsToOutreach({ from: "client@company.example", subject: "Re: Quick idea" }, known)).toBe(false);
    expect(belongsToOutreach({ from: "", subject: "" }, known)).toBe(false);
  });
});

describe("mailbox reading settings", () => {
  it("needs the mailbox and defaults to the Hostinger server", () => {
    expect(imapSettings({})).toBeNull();
    expect(imapSettings({ OUTREACH_SMTP_USER: "sam@outreach.example", OUTREACH_SMTP_PASSWORD: "pw" })).toEqual({
      host: "imap.hostinger.com",
      port: 993,
      user: "sam@outreach.example",
      password: "pw",
    });
  });
});

describe("recording replies from the mailbox", () => {
  const mail = (over: Partial<IncomingMail>): IncomingMail => ({
    uid: 1,
    from: "owner@prospect.example",
    subject: "Re: Quick idea",
    text: quoted("Sounds good."),
    date: new Date("2026-11-25T10:00:00Z"),
    ...over,
  });
  /** A fake inbox that, like the real one, hands over only the messages `wants` accepts. */
  const readerWith = (mails: IncomingMail[]): InboxReader & { handled: number[]; listed: number; opened: number[] } => {
    const r = {
      handled: [] as number[],
      opened: [] as number[],
      listed: 0,
      async listUnhandled(_since: Date, _limit: number, wants: (head: MailHead) => boolean) {
        r.listed++;
        const accepted = mails.filter((m) => wants(m));
        r.opened = accepted.map((m) => m.uid);
        return { mails: accepted, skipped: mails.length - accepted.length };
      },
      async markHandled(uid: number) {
        r.handled.push(uid);
      },
      async close() {},
    };
    return r;
  };

  beforeEach(() => {
    db.outreachSend.findMany.mockResolvedValue([{ toEmail: "Owner@Prospect.example", leadId: "lead_1", threadId: "<first@outreach.example>" }]);
    db.outreachReply.findFirst.mockResolvedValue(null);
    recordReply.mockResolvedValue({ replyId: "r1", label: "interested", needsReview: false, canceledFollowUps: 2, suppressed: false });
  });

  it("does not open the inbox when no outreach was ever sent", async () => {
    db.outreachSend.findMany.mockResolvedValue([]);
    const reader = readerWith([mail({})]);
    const r = await readReplies({ organizationId: "org", reader });
    expect(reader.listed).toBe(0);
    expect(r.checked).toBe(0);
    expect(recordReply).not.toHaveBeenCalled();
  });

  it("records a reply against the right lead with only the written text", async () => {
    const reader = readerWith([mail({ uid: 7 })]);
    const r = await readReplies({ organizationId: "org", reader });
    expect(recordReply).toHaveBeenCalledWith({
      organizationId: "org",
      leadId: "lead_1",
      body: "Sounds good.",
      threadId: "<first@outreach.example>",
      isDemo: false,
      receivedAt: new Date("2026-11-25T10:00:00Z"),
    });
    expect(r).toMatchObject({ checked: 1, replies: 1, bounces: 0, ignored: 0 });
    expect(r.recorded).toEqual([{ leadId: "lead_1", label: "interested", needsReview: false, suppressed: false }]);
    expect(reader.handled).toEqual([7]);
  });

  it("never opens, marks or stores mail that is not about outreach", async () => {
    const reader = readerWith([
      mail({ uid: 3, from: "billing@host.example", subject: "Invoice", text: "Your invoice" }),
      mail({ uid: 5, from: "A Client <client@company.example>", subject: "Question about our project", text: "Private" }),
    ]);
    const r = await readReplies({ organizationId: "org", reader });
    expect(recordReply).not.toHaveBeenCalled();
    expect(r).toMatchObject({ checked: 0, replies: 0, ignored: 2 });
    expect(reader.opened).toEqual([]);
    expect(reader.handled).toEqual([]);
  });

  it("opens only the outreach reply among everyday mail", async () => {
    const reader = readerWith([
      mail({ uid: 3, from: "billing@host.example", subject: "Invoice", text: "Your invoice" }),
      mail({ uid: 8 }),
    ]);
    const r = await readReplies({ organizationId: "org", reader });
    expect(reader.opened).toEqual([8]);
    expect(reader.handled).toEqual([8]);
    expect(r).toMatchObject({ checked: 1, replies: 1, ignored: 1 });
  });

  it("records the same message only once", async () => {
    db.outreachReply.findFirst.mockResolvedValue({ id: "existing" });
    const reader = readerWith([mail({ uid: 9 })]);
    const r = await readReplies({ organizationId: "org", reader });
    expect(recordReply).not.toHaveBeenCalled();
    expect(r).toMatchObject({ replies: 0, duplicates: 1 });
    expect(reader.handled).toEqual([9]);
  });

  it("counts a delivery failure as a bounce", async () => {
    recordReply.mockResolvedValue({ replyId: "r2", label: "bounce", needsReview: false, canceledFollowUps: 2, suppressed: true });
    const reader = readerWith([
      mail({ uid: 4, from: "MAILER-DAEMON@mail.example", subject: "Undelivered Mail Returned to Sender", text: "<owner@prospect.example>: 550 unknown user" }),
    ]);
    const r = await readReplies({ organizationId: "org", reader });
    expect(r).toMatchObject({ replies: 0, bounces: 1 });
    expect(r.recorded[0]).toMatchObject({ label: "bounce", suppressed: true });
  });
});
