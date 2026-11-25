import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  outreachSend: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  suppression: { findFirst: vi.fn() },
  outreachReply: { findMany: vi.fn() },
  meeting: { findFirst: vi.fn() },
  lead: { updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

import { processDueSends, providerFor, liveSendingEnabled, reconcileSends, type OutreachProvider } from "@/lib/outreach/engine";
import {
  buildMail,
  mailboxConfig,
  mailboxProvider,
  messageIdFor,
  receiptForError,
  testMailbox,
  type MailTransport,
  type OutgoingMail,
} from "@/lib/outreach/mailbox";
import { DEFAULT_DAILY_LIMIT, MAX_DAILY_LIMIT, PER_RUN_LIMIT, dailyAllowance, dailyLimit, runBudget } from "@/lib/outreach/pace";

const MAILBOX = { OUTREACH_SMTP_USER: "sam@outreach.example", OUTREACH_SMTP_PASSWORD: "pw" };
const NOW = new Date("2026-11-25T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("outreach pacing", () => {
  it("uses a safe default and never exceeds the ceiling", () => {
    expect(dailyLimit({})).toBe(DEFAULT_DAILY_LIMIT);
    expect(dailyLimit({ OUTREACH_DAILY_LIMIT: "30" })).toBe(30);
    expect(dailyLimit({ OUTREACH_DAILY_LIMIT: "5000" })).toBe(MAX_DAILY_LIMIT);
    expect(dailyLimit({ OUTREACH_DAILY_LIMIT: "0" })).toBe(DEFAULT_DAILY_LIMIT);
    expect(dailyLimit({ OUTREACH_DAILY_LIMIT: "lots" })).toBe(DEFAULT_DAILY_LIMIT);
  });

  it("warms up over three weeks, counted from the first real email", () => {
    expect(dailyAllowance(null, NOW, 20)).toBe(5); // nothing sent yet
    expect(dailyAllowance(daysAgo(3), NOW, 20)).toBe(5);
    expect(dailyAllowance(daysAgo(8), NOW, 20)).toBe(10);
    expect(dailyAllowance(daysAgo(15), NOW, 20)).toBe(15);
    expect(dailyAllowance(daysAgo(22), NOW, 20)).toBe(20);
    expect(dailyAllowance(daysAgo(400), NOW, 20)).toBe(20);
  });

  it("never warms up past a lower configured limit", () => {
    expect(dailyAllowance(daysAgo(8), NOW, 8)).toBe(8);
    expect(dailyAllowance(null, NOW, 3)).toBe(3);
  });

  it("spreads the allowance across runs and stops at zero", () => {
    expect(runBudget(20, 0)).toBe(PER_RUN_LIMIT);
    expect(runBudget(5, 3)).toBe(2);
    expect(runBudget(5, 5)).toBe(0);
    expect(runBudget(5, 9)).toBe(0);
  });
});

describe("outreach mailbox settings", () => {
  it("is not configured without both the address and the password", () => {
    expect(mailboxConfig({})).toBeNull();
    expect(mailboxConfig({ OUTREACH_SMTP_USER: "sam@outreach.example" })).toBeNull();
    expect(mailboxConfig({ OUTREACH_SMTP_PASSWORD: "pw" })).toBeNull();
  });

  it("defaults to the Hostinger mail server and reads the sender address", () => {
    expect(mailboxConfig(MAILBOX)).toMatchObject({
      host: "smtp.hostinger.com",
      port: 465,
      from: "sam@outreach.example",
      address: "sam@outreach.example",
    });
    const named = mailboxConfig({ ...MAILBOX, OUTREACH_EMAIL_FROM: "Sam Lee <Sam@Outreach.example>", OUTREACH_SMTP_PORT: "587" });
    expect(named).toMatchObject({ from: "Sam Lee <Sam@Outreach.example>", address: "sam@outreach.example", port: 587 });
  });
});

describe("outreach mail message", () => {
  const cfg = mailboxConfig(MAILBOX)!;
  const first = { to: "owner@prospect.example", subject: "Quick idea", body: "Hello", idempotencyKey: "outreach:lead_1:0" };

  it("gives each send one stable id on the sending domain", () => {
    const id = messageIdFor("outreach:lead_1:0", "sam@outreach.example");
    expect(id).toMatch(/^<[0-9a-f]{32}@outreach\.example>$/);
    expect(messageIdFor("outreach:lead_1:0", "sam@outreach.example")).toBe(id);
    expect(messageIdFor("outreach:lead_1:1", "sam@outreach.example")).not.toBe(id);
  });

  it("sends the first email as a new conversation with an unsubscribe header", () => {
    const mail = buildMail(first, cfg);
    expect(mail).toMatchObject({ from: "sam@outreach.example", to: "owner@prospect.example", subject: "Quick idea", text: "Hello" });
    expect(mail.inReplyTo).toBeUndefined();
    expect(mail.headers["List-Unsubscribe"]).toBe("<mailto:sam@outreach.example?subject=unsubscribe>");
  });

  it("threads a follow-up onto the first email", () => {
    const parent = buildMail(first, cfg).messageId;
    const followUp = buildMail({ ...first, subject: "Re: Quick idea", idempotencyKey: "outreach:lead_1:1", threadId: parent }, cfg);
    expect(followUp.inReplyTo).toBe(parent);
    expect(followUp.references).toBe(parent);
    expect(followUp.messageId).not.toBe(parent);
  });

  it("ignores a thread id that is not a mail message id", () => {
    expect(buildMail({ ...first, threadId: "resend-id-123" }, cfg).inReplyTo).toBeUndefined();
  });
});

describe("outreach mailbox sender", () => {
  const req = { to: "owner@prospect.example", subject: "Quick idea", body: "Hello", idempotencyKey: "outreach:lead_1:0" };
  const transportThat = (fn: (mail: OutgoingMail) => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>): MailTransport & { sent: OutgoingMail[] } => {
    const sent: OutgoingMail[] = [];
    return { sent, sendMail: (mail) => (sent.push(mail), fn(mail)) };
  };

  it("reports an accepted email with its id as the thread", async () => {
    const t = transportThat(async () => ({ accepted: ["owner@prospect.example"], rejected: [] }));
    const r = await mailboxProvider(MAILBOX, t).send(req);
    expect(r.status).toBe("accepted");
    expect(r.messageId).toBe(t.sent[0]!.messageId);
    expect(r.threadId).toBe(t.sent[0]!.messageId);
  });

  it("keeps a follow-up in the first email's thread", async () => {
    const t = transportThat(async () => ({ accepted: ["x"] }));
    const parent = "<abc@outreach.example>";
    const r = await mailboxProvider(MAILBOX, t).send({ ...req, idempotencyKey: "outreach:lead_1:1", threadId: parent });
    expect(r.threadId).toBe(parent);
  });

  it("sends nothing when the mailbox is not configured", async () => {
    const t = transportThat(async () => ({ accepted: ["x"] }));
    const r = await mailboxProvider({}, t).send(req);
    expect(r.status).toBe("rejected");
    expect(t.sent).toHaveLength(0);
  });

  it("treats a refused recipient as rejected", async () => {
    const t = transportThat(async () => ({ accepted: [], rejected: ["owner@prospect.example"] }));
    expect((await mailboxProvider(MAILBOX, t).send(req)).status).toBe("rejected");
  });

  it("separates a clear refusal from an unclear outcome", () => {
    expect(receiptForError({ responseCode: 550 }).status).toBe("rejected");
    expect(receiptForError({ responseCode: 535 })).toEqual({ status: "rejected", error: "Mailbox sign-in failed" });
    expect(receiptForError({ code: "EAUTH" })).toEqual({ status: "rejected", error: "Mailbox sign-in failed" });
    expect(receiptForError({ code: "ECONNECTION" }).status).toBe("rejected");
    // The connection dropped after the message was handed over: it may have been delivered.
    expect(receiptForError({ code: "ETIMEDOUT" }).status).toBe("ambiguous");
    expect(receiptForError(new Error("socket closed")).status).toBe("ambiguous");
  });

  it("is marked as a sender that must not be asked twice", () => {
    expect(mailboxProvider(MAILBOX).idempotent).toBe(false);
  });

  it("tests the sign-in without sending", async () => {
    const sendMail = vi.fn();
    expect(await testMailbox({}, { sendMail })).toMatchObject({ ok: false });
    const ok = await testMailbox(MAILBOX, { sendMail, verify: async () => true });
    expect(ok).toEqual({ ok: true, detail: "Signed in to smtp.hostinger.com as sam@outreach.example. Nothing was sent." });
    const bad = await testMailbox(MAILBOX, { sendMail, verify: async () => Promise.reject({ code: "EAUTH" }) });
    expect(bad).toEqual({ ok: false, detail: "Mailbox sign-in failed" });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("choosing the outreach sender", () => {
  it("stays off until live sending is switched on", () => {
    expect(providerFor(false, MAILBOX)).toBeNull();
    expect(liveSendingEnabled(MAILBOX)).toBe(false);
    expect(liveSendingEnabled({ ...MAILBOX, OUTREACH_LIVE_SENDING: "true" })).toBe(true);
  });

  it("prefers the mailbox over Resend, and never uses a real sender for a fixture lead", () => {
    const env = { ...MAILBOX, RESEND_API_KEY: "k", OUTREACH_LIVE_SENDING: "true" };
    expect(providerFor(false, env)?.name).toBe("mailbox");
    expect(providerFor(true, env)?.name).toBe("test");
  });
});

describe("paced sending", () => {
  const due = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      leadId: `lead_${i}`,
      step: 0,
      toEmail: `owner${i}@prospect.example`,
      subject: "Quick idea",
      body: "Hello",
      idempotencyKey: `outreach:lead_${i}:0`,
      threadId: null,
    }));
  const sender = (name: string): OutreachProvider & { calls: number } => {
    const p = {
      name,
      idempotent: name === "test",
      calls: 0,
      async send() {
        p.calls++;
        return { status: "accepted" as const, messageId: `<m${p.calls}@outreach.example>`, threadId: `<m${p.calls}@outreach.example>` };
      },
    };
    return p;
  };

  beforeEach(() => {
    process.env.OUTREACH_ALLOWED_RECIPIENTS = "*";
    process.env.OUTREACH_DAILY_LIMIT = "";
    db.outreachSend.findMany.mockResolvedValue(due(8));
    db.outreachSend.findFirst.mockResolvedValue(null);
    db.outreachSend.count.mockResolvedValue(0);
    db.outreachSend.updateMany.mockResolvedValue({ count: 1 });
    db.outreachSend.update.mockResolvedValue({});
    db.suppression.findFirst.mockResolvedValue(null);
    db.outreachReply.findMany.mockResolvedValue([]);
    db.meeting.findFirst.mockResolvedValue(null);
    db.lead.updateMany.mockResolvedValue({ count: 1 });
  });

  it("sends only this run's share from a new mailbox and holds the rest", async () => {
    const p = sender("mailbox");
    const r = await processDueSends({ organizationId: "org", isDemo: false, now: NOW, provider: p });
    expect(p.calls).toBe(5);
    expect(r).toMatchObject({ due: 8, sent: 5, heldDailyLimit: 3 });
  });

  it("counts what already went out in the last 24 hours", async () => {
    db.outreachSend.count.mockResolvedValue(4); // allowance is 5 in the first week
    const p = sender("mailbox");
    const r = await processDueSends({ organizationId: "org", isDemo: false, now: NOW, provider: p });
    expect(p.calls).toBe(1);
    expect(r).toMatchObject({ sent: 1, heldDailyLimit: 7 });
  });

  it("sends nothing once the day's allowance is used", async () => {
    db.outreachSend.findFirst.mockResolvedValue({ sentAt: daysAgo(30) }); // warmed up: 20 a day
    db.outreachSend.count.mockResolvedValue(20);
    const p = sender("mailbox");
    const r = await processDueSends({ organizationId: "org", isDemo: false, now: NOW, provider: p });
    expect(p.calls).toBe(0);
    expect(r).toMatchObject({ sent: 0, heldDailyLimit: 8 });
    // Held emails are left untouched for a later run.
    expect(db.outreachSend.updateMany).not.toHaveBeenCalled();
  });

  it("does not pace the in-app test sender", async () => {
    const p = sender("test");
    const r = await processDueSends({ organizationId: "org", isDemo: true, now: NOW, provider: p });
    expect(p.calls).toBe(8);
    expect(r.heldDailyLimit).toBe(0);
    expect(db.outreachSend.count).not.toHaveBeenCalled();
  });

  it("still holds an address that is not on the allowed list", async () => {
    process.env.OUTREACH_ALLOWED_RECIPIENTS = "";
    const p = sender("mailbox");
    const r = await processDueSends({ organizationId: "org", isDemo: false, now: NOW, provider: p });
    expect(p.calls).toBe(0);
    expect(r).toMatchObject({ heldNotAllowed: 8, heldDailyLimit: 0 });
  });

  it("never re-sends an unclear email through a sender that cannot deduplicate", async () => {
    db.outreachSend.findMany.mockResolvedValue(due(2));
    const p = sender("mailbox");
    const r = await reconcileSends({ organizationId: "org", isDemo: false, now: NOW, provider: p });
    expect(p.calls).toBe(0);
    expect(r).toEqual({ reconciled: 0, stillAmbiguous: 2 });
  });
});
