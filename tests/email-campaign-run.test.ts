import { beforeEach, describe, expect, it, vi } from "vitest";

/** A small in-memory stand-in for the three tables a campaign run touches. */
const { db, state } = vi.hoisted(() => {
  type Rec = {
    id: string;
    campaignId: string;
    email: string;
    status: string;
    sentAt: Date | null;
    openedAt: Date | null;
    clickedAt: Date | null;
    providerMessageId: string | null;
    error: string | null;
    createdAt: Date;
  };
  type Camp = {
    id: string;
    organizationId: string;
    name: string;
    subject: string;
    body: string;
    status: string;
    sentAt: Date | null;
    updatedAt: Date;
    opens: number;
    clicks: number;
    unsubscribes: number;
  };
  const state = {
    campaigns: [] as Camp[],
    recipients: [] as Rec[],
    suppressions: [] as { organizationId: string; email: string; reason: string; source: string }[],
    audits: [] as { action: string }[],
  };

  // Only the filter shapes the code under test really uses.
  const matches = (r: Rec, where: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(where)) {
      if (k === "campaign") {
        const c = state.campaigns.find((x) => x.id === r.campaignId)!;
        if (c.organizationId !== (v as { organizationId: string }).organizationId) return false;
      } else if (k === "sentAt" && v && typeof v === "object" && !(v instanceof Date)) {
        if (!r.sentAt || r.sentAt < (v as { gte: Date }).gte) return false;
      } else if (k === "status" && v && typeof v === "object") {
        if (r.status === (v as { not: string }).not) return false;
      } else if ((r as unknown as Record<string, unknown>)[k] !== v) return false;
    }
    return true;
  };
  const bump = (target: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && !(v instanceof Date) && "increment" in v) {
        target[k] = (target[k] as number) + (v as { increment: number }).increment;
      } else target[k] = v;
    }
  };

  const db = {
    emailCampaign: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.campaigns.find((c) => Object.entries(where).every(([k, v]) => (c as unknown as Record<string, unknown>)[k] === v)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = state.campaigns.find((x) => x.id === where.id)!;
        bump(c as unknown as Record<string, unknown>, data);
        return c;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = state.campaigns.filter((c) => Object.entries(where).every(([k, v]) => (c as unknown as Record<string, unknown>)[k] === v));
        hit.forEach((c) => bump(c as unknown as Record<string, unknown>, data));
        return { count: hit.length };
      },
    },
    emailRecipient: {
      groupBy: async ({ where }: { where: { campaignId: string } }) => {
        const by = new Map<string, number>();
        for (const r of state.recipients.filter((x) => x.campaignId === where.campaignId)) by.set(r.status, (by.get(r.status) ?? 0) + 1);
        return Array.from(by, ([status, n]) => ({ status, _count: { _all: n } }));
      },
      count: async ({ where }: { where: Record<string, unknown> }) => state.recipients.filter((r) => matches(r, where)).length,
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        state.recipients.filter((r) => matches(r, where)).slice(0, take),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = state.recipients.find((x) => x.id === where.id);
        if (!r) return null;
        const c = state.campaigns.find((x) => x.id === r.campaignId)!;
        return { ...r, campaign: { organizationId: c.organizationId } };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const r = state.recipients.find((x) => matches(x, where));
        if (!r) return null;
        const c = state.campaigns.find((x) => x.id === r.campaignId)!;
        return { ...r, campaign: { organizationId: c.organizationId } };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = state.recipients.find((x) => x.id === where.id)!;
        bump(r as unknown as Record<string, unknown>, data);
        return r;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = state.recipients.filter((r) => matches(r, where));
        hit.forEach((r) => bump(r as unknown as Record<string, unknown>, data));
        return { count: hit.length };
      },
    },
    suppression: {
      findMany: async ({ where }: { where: { organizationId: string; email: { in: string[] } } }) =>
        state.suppressions.filter((s) => s.organizationId === where.organizationId && where.email.in.indexOf(s.email) !== -1),
      upsert: async ({ create }: { create: { organizationId: string; email: string; reason: string; source: string } }) => {
        if (!state.suppressions.some((s) => s.organizationId === create.organizationId && s.email === create.email)) state.suppressions.push(create);
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        state.audits.push({ action: data.action });
      },
    },
  };
  return { db, state };
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { applyCampaignEvent, processCampaign, unsubscribeRecipient } from "@/lib/email/campaign-run";
import { CAMPAIGN_PER_RUN, readUnsubscribeToken, type CampaignReceipt, type CampaignSendRequest } from "@/lib/email/campaign";

const NOW = new Date("2026-11-25T12:00:00Z");
const ENV = {
  RESEND_API_KEY: "re_test",
  EMAIL_CAMPAIGN_FROM: "Valiant <news@news.example.com>",
  NEXTAUTH_URL: "https://app.example.com",
  EMAIL_CAMPAIGN_LIVE_SENDING: "true",
  EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: "me@example.com",
  NEXTAUTH_SECRET: "test-secret",
};

function seed(emails: string[], status = "sending") {
  state.campaigns.push({
    id: "c1",
    organizationId: "org1",
    name: "News",
    subject: "Hello",
    body: "Body text",
    status,
    sentAt: null,
    updatedAt: NOW,
    opens: 0,
    clicks: 0,
    unsubscribes: 0,
  });
  emails.forEach((email, i) =>
    state.recipients.push({
      id: `r${i + 1}`,
      campaignId: "c1",
      email,
      status: "pending",
      sentAt: null,
      openedAt: null,
      clickedAt: null,
      providerMessageId: null,
      error: null,
      createdAt: NOW,
    }),
  );
}

function recorder(answer: (req: CampaignSendRequest) => CampaignReceipt = (req) => ({ status: "accepted", messageId: `msg-${req.recipientId}` })) {
  const calls: CampaignSendRequest[] = [];
  return { calls, send: async (req: CampaignSendRequest) => (calls.push(req), answer(req)) };
}
const run = (send: ReturnType<typeof recorder>["send"], env: Record<string, string> = ENV) =>
  processCampaign({ organizationId: "org1", campaignId: "c1", env, now: NOW, send, sleep: async () => undefined });
const statusOf = (id: string) => state.recipients.find((r) => r.id === id)!.status;

beforeEach(() => {
  state.campaigns.length = 0;
  state.recipients.length = 0;
  state.suppressions.length = 0;
  state.audits.length = 0;
  process.env.NEXTAUTH_SECRET = ENV.NEXTAUTH_SECRET;
});

describe("sending a campaign", () => {
  it("emails only the allowed address and skips everyone else", async () => {
    seed(["me@example.com", "client@example.com", "lead@example.com"]);
    const { calls, send } = recorder();
    const result = await run(send);

    expect(calls.map((c) => c.to)).toEqual(["me@example.com"]);
    expect(result).toMatchObject({ off: null, sent: 1, skipped: 2, refused: 0, remaining: 0, finished: true });
    expect(statusOf("r1")).toBe("sent");
    expect(statusOf("r2")).toBe("skipped");
    expect(state.recipients[1]!.error).toBe("Not on the allowed recipient list");
    expect(state.campaigns[0]).toMatchObject({ status: "sent", sentAt: NOW });
  });

  it("sends nothing at all while the switch is off, and leaves the campaign waiting", async () => {
    seed(["me@example.com"]);
    const { calls, send } = recorder();
    const result = await run(send, { ...ENV, EMAIL_CAMPAIGN_LIVE_SENDING: "" });

    expect(calls).toEqual([]);
    expect(result).toMatchObject({ off: "Campaign sending is switched off.", sent: 0, remaining: 1, finished: false });
    expect(statusOf("r1")).toBe("pending");
    expect(state.campaigns[0]!.status).toBe("sending");
  });

  it("never emails an address on the do-not-email list", async () => {
    seed(["me@example.com"]);
    state.suppressions.push({ organizationId: "org1", email: "me@example.com", reason: "unsubscribe", source: "x" });
    const { calls, send } = recorder();
    const result = await run(send);

    expect(calls).toEqual([]);
    expect(result).toMatchObject({ sent: 0, skipped: 1, finished: true });
    expect(state.recipients[0]!.error).toBe("On the do-not-email list");
  });

  it("puts a working unsubscribe link for that recipient into the email", async () => {
    seed(["me@example.com"]);
    const { calls, send } = recorder();
    await run(send);

    const req = calls[0]!;
    expect(req.unsubscribeUrl.startsWith("https://app.example.com/unsubscribe/")).toBe(true);
    const token = req.unsubscribeUrl.split("/unsubscribe/")[1]!;
    expect(readUnsubscribeToken(token, ENV.NEXTAUTH_SECRET)).toBe("r1");
    expect(req.oneClickUrl).toBe(`https://app.example.com/api/unsubscribe?token=${token}`);
    expect(req.email.text).toContain(`Unsubscribe: ${req.unsubscribeUrl}`);
    expect(req.subject).toBe("Hello");
  });

  it("does not send a recipient twice when the job runs again", async () => {
    seed(["me@example.com"]);
    const first = recorder();
    await run(first.send);
    state.campaigns[0]!.status = "sending"; // as if a second run raced the first
    const second = recorder();
    const again = await run(second.send);

    expect(first.calls.length).toBe(1);
    expect(second.calls.length).toBe(0);
    expect(again).toMatchObject({ sent: 0, finished: true });
  });

  it("stops at the batch size and carries the rest to the next run", async () => {
    const many = Array.from({ length: CAMPAIGN_PER_RUN + 5 }, (_, i) => `p${i}@example.com`);
    seed(many);
    const env = { ...ENV, EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: "*" };
    const first = recorder();
    const a = await run(first.send, env);
    expect(a).toMatchObject({ sent: CAMPAIGN_PER_RUN, remaining: 5, finished: false, heldDailyLimit: true });
    expect(state.campaigns[0]!.status).toBe("sending");

    const second = recorder();
    const b = await run(second.send, env);
    expect(b).toMatchObject({ sent: 5, remaining: 0, finished: true });
    expect(first.calls.length + second.calls.length).toBe(many.length);
  });

  it("holds everything once the daily limit is used up", async () => {
    seed(["a@example.com", "b@example.com", "c@example.com"]);
    state.recipients[0]!.status = "sent";
    state.recipients[0]!.sentAt = new Date(NOW.getTime() - 60 * 60 * 1000);
    state.recipients[1]!.status = "sent";
    state.recipients[1]!.sentAt = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
    const { calls, send } = recorder();
    const result = await run(send, { ...ENV, EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: "*", EMAIL_CAMPAIGN_DAILY_LIMIT: "2" });

    expect(calls).toEqual([]);
    expect(result).toMatchObject({ sent: 0, heldDailyLimit: true, remaining: 1, finished: false });
  });

  it("marks a refused email as refused, with the reason, and carries on", async () => {
    seed(["bad@example.com", "me@example.com"]);
    const { send } = recorder((req) =>
      req.to === "bad@example.com" ? { status: "rejected", error: "Invalid address" } : { status: "accepted", messageId: "m2" },
    );
    const result = await run(send, { ...ENV, EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: "*" });

    expect(result).toMatchObject({ sent: 1, refused: 1, finished: true });
    expect(state.recipients[0]).toMatchObject({ status: "failed", error: "Invalid address" });
    expect(state.recipients[1]).toMatchObject({ status: "sent", providerMessageId: "m2" });
  });

  it("waits and keeps the recipient pending when the email service is busy", async () => {
    seed(["me@example.com", "other@example.com"]);
    const { calls, send } = recorder(() => ({ status: "retry", error: "HTTP 429" }));
    const result = await run(send, { ...ENV, EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: "*" });

    expect(calls.length).toBe(1);
    expect(result).toMatchObject({ sent: 0, waitingForService: true, remaining: 2, finished: false });
    expect(statusOf("r1")).toBe("pending");
    expect(state.campaigns[0]!.status).toBe("sending");
  });

  it("releases a recipient left half-sent by a run that died", async () => {
    seed(["me@example.com"]);
    state.recipients[0]!.status = "sending";
    state.campaigns[0]!.updatedAt = new Date(NOW.getTime() - 11 * 60 * 1000);
    const { calls, send } = recorder();
    const result = await run(send);

    expect(calls.length).toBe(1);
    expect(result).toMatchObject({ sent: 1, finished: true });
  });

  it("ignores a draft campaign and another organization's campaign", async () => {
    seed(["me@example.com"], "draft");
    const { calls, send } = recorder();
    expect(await run(send)).toBeNull();
    state.campaigns[0]!.status = "sending";
    expect(await processCampaign({ organizationId: "other-org", campaignId: "c1", env: ENV, now: NOW, send })).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("unsubscribing", () => {
  it("stops future email to the address and counts it once", async () => {
    seed(["me@example.com"]);
    state.recipients[0]!.status = "sent";

    expect(await unsubscribeRecipient("r1", "unsubscribe_link")).toEqual({ found: true, email: "me@example.com", alreadyDone: false });
    expect(await unsubscribeRecipient("r1", "unsubscribe_link")).toEqual({ found: true, email: "me@example.com", alreadyDone: true });

    expect(statusOf("r1")).toBe("unsubscribed");
    expect(state.campaigns[0]!.unsubscribes).toBe(1);
    expect(state.suppressions).toEqual([{ organizationId: "org1", email: "me@example.com", reason: "unsubscribe", source: "unsubscribe_link" }]);
    expect(state.audits).toEqual([{ action: "email_campaign.unsubscribe" }]);
  });

  it("reports an unknown recipient without changing anything", async () => {
    expect(await unsubscribeRecipient("nope", "unsubscribe_link")).toEqual({ found: false });
    expect(state.suppressions).toEqual([]);
  });
});

describe("delivery events for a campaign email", () => {
  const at = new Date("2026-11-25T13:00:00Z");
  beforeEach(() => {
    seed(["me@example.com"]);
    Object.assign(state.recipients[0]!, { status: "sent", sentAt: NOW, providerMessageId: "msg-1" });
  });

  it("counts an open once, however often the email is opened", async () => {
    await applyCampaignEvent({ type: "opened", providerMessageId: "msg-1", at });
    await applyCampaignEvent({ type: "opened", providerMessageId: "msg-1", at });
    expect(state.campaigns[0]!.opens).toBe(1);
    expect(state.recipients[0]!.openedAt).toEqual(at);
  });

  it("treats a click as an open too", async () => {
    await applyCampaignEvent({ type: "clicked", providerMessageId: "msg-1", at });
    expect(state.campaigns[0]).toMatchObject({ opens: 1, clicks: 1 });
  });

  it("puts a bounced address on the do-not-email list", async () => {
    expect(await applyCampaignEvent({ type: "bounced", providerMessageId: "msg-1", at })).toEqual({ matched: true, suppressed: true });
    expect(state.recipients[0]).toMatchObject({ status: "bounced", error: "Email bounced" });
    expect(state.suppressions[0]).toMatchObject({ email: "me@example.com", reason: "bounce" });
  });

  it("treats a spam complaint as an unsubscribe", async () => {
    await applyCampaignEvent({ type: "complained", providerMessageId: "msg-1", at });
    expect(statusOf("r1")).toBe("unsubscribed");
    expect(state.campaigns[0]!.unsubscribes).toBe(1);
    expect(state.suppressions[0]).toMatchObject({ reason: "unsubscribe", source: "provider:complained" });
  });

  it("does nothing for an email it does not know", async () => {
    expect(await applyCampaignEvent({ type: "opened", providerMessageId: "unknown", at })).toEqual({ matched: false });
    expect(state.campaigns[0]!.opens).toBe(0);
  });
});
