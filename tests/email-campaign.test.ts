import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_PER_RUN,
  TEST_NOTE,
  buildTestEmail,
  campaignDailyLimit,
  campaignRecipientAllowed,
  campaignRunBudget,
  campaignSender,
  countsFrom,
  countsLine,
  decideRecipient,
  deliveredBase,
  readUnsubscribeToken,
  renderCampaignEmail,
  sendCampaignEmail,
  textToHtml,
  unsubscribeToken,
  type CampaignSender,
} from "@/lib/email/campaign";
import { parseEmails } from "@/lib/email/parse-emails";
import { recipientDetail, recipientLabel } from "@/lib/email/campaign-labels";
import { formatNotification } from "@/lib/notifications/dispatch";

const READY = {
  RESEND_API_KEY: "re_test",
  EMAIL_CAMPAIGN_FROM: "Valiant <news@news.example.com>",
  NEXTAUTH_URL: "https://app.example.com/",
  EMAIL_CAMPAIGN_LIVE_SENDING: "true",
};

describe("campaign sending is off until everything is set", () => {
  it("is off with no settings at all", () => {
    expect(campaignSender({})).toEqual({ ready: false, reason: "Resend is not connected." });
  });

  it("is off with a key alone", () => {
    expect(campaignSender({ RESEND_API_KEY: "re_test" })).toMatchObject({ ready: false, reason: "No sender address is set for campaigns." });
  });

  it("is off without a public https address for the unsubscribe link", () => {
    expect(campaignSender({ ...READY, NEXTAUTH_URL: "" }).ready).toBe(false);
    expect(campaignSender({ ...READY, NEXTAUTH_URL: "http://localhost:3001" }).ready).toBe(false);
  });

  it("is off until the switch says true", () => {
    expect(campaignSender({ ...READY, EMAIL_CAMPAIGN_LIVE_SENDING: "" })).toEqual({ ready: false, reason: "Campaign sending is switched off." });
    expect(campaignSender({ ...READY, EMAIL_CAMPAIGN_LIVE_SENDING: "yes" }).ready).toBe(false);
  });

  it("is on with all four, and never falls back to a shared test sender", () => {
    expect(campaignSender(READY)).toEqual({
      ready: true,
      apiKey: "re_test",
      from: "Valiant <news@news.example.com>",
      baseUrl: "https://app.example.com",
      postalAddress: null,
      dailyLimit: 100,
    });
  });

  it("keeps the daily limit sane", () => {
    expect(campaignDailyLimit({})).toBe(100);
    expect(campaignDailyLimit({ EMAIL_CAMPAIGN_DAILY_LIMIT: "30" })).toBe(30);
    expect(campaignDailyLimit({ EMAIL_CAMPAIGN_DAILY_LIMIT: "-5" })).toBe(100);
    expect(campaignDailyLimit({ EMAIL_CAMPAIGN_DAILY_LIMIT: "999999" })).toBe(5000);
  });
});

describe("who may receive a campaign email", () => {
  it("allows nobody when the list is unset", () => {
    expect(campaignRecipientAllowed("a@example.com", {})).toBe(false);
    expect(campaignRecipientAllowed("a@example.com", { EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: " , " })).toBe(false);
  });

  it("allows only listed addresses, ignoring case and spaces", () => {
    const env = { EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: " Me@Example.com , other@example.com" };
    expect(campaignRecipientAllowed("me@example.com", env)).toBe(true);
    expect(campaignRecipientAllowed(" OTHER@example.com ", env)).toBe(true);
    expect(campaignRecipientAllowed("client@example.com", env)).toBe(false);
  });

  it("does not read the outreach list", () => {
    expect(campaignRecipientAllowed("a@example.com", { OUTREACH_ALLOWED_RECIPIENTS: "*" })).toBe(false);
  });

  it("allows anyone only with a star", () => {
    expect(campaignRecipientAllowed("a@example.com", { EMAIL_CAMPAIGN_ALLOWED_RECIPIENTS: "*" })).toBe(true);
  });

  it("skips a suppressed address even when it is allowed", () => {
    expect(decideRecipient({ suppressed: true, allowed: true })).toEqual({ action: "skip", reason: "On the do-not-email list" });
    expect(decideRecipient({ suppressed: false, allowed: false })).toEqual({ action: "skip", reason: "Not on the allowed recipient list" });
    expect(decideRecipient({ suppressed: false, allowed: true })).toEqual({ action: "send" });
  });

  it("never sends more than the daily limit or the batch size", () => {
    expect(campaignRunBudget(100, 0)).toBe(CAMPAIGN_PER_RUN);
    expect(campaignRunBudget(100, 95)).toBe(5);
    expect(campaignRunBudget(100, 100)).toBe(0);
    expect(campaignRunBudget(100, 140)).toBe(0);
  });
});

describe("unsubscribe links", () => {
  const secret = "s3cret";
  const id = "0b9c2d0e-5f43-4a6f-9a51-6f0c3a1b2c3d";

  it("round-trips the recipient id", () => {
    expect(readUnsubscribeToken(unsubscribeToken(id, secret), secret)).toBe(id);
  });

  it("rejects a changed id, a changed signature, another secret and junk", () => {
    const token = unsubscribeToken(id, secret);
    const sig = token.slice(token.lastIndexOf(".") + 1);
    expect(readUnsubscribeToken(`${id.replace("0b9c", "ffff")}.${sig}`, secret)).toBeNull();
    expect(readUnsubscribeToken(`${id}.${"a".repeat(sig.length)}`, secret)).toBeNull();
    expect(readUnsubscribeToken(token, "other")).toBeNull();
    expect(readUnsubscribeToken("", secret)).toBeNull();
    expect(readUnsubscribeToken(null, secret)).toBeNull();
    expect(readUnsubscribeToken("nodot", secret)).toBeNull();
    expect(readUnsubscribeToken(token, "")).toBeNull();
  });
});

describe("the email that goes out", () => {
  const url = "https://app.example.com/unsubscribe/abc.def";

  it("always carries the unsubscribe link, in text and in html", () => {
    const mail = renderCampaignEmail({ body: "Hello there", unsubscribeUrl: url, postalAddress: null });
    expect(mail.text).toBe(`Hello there\n\n--\nUnsubscribe: ${url}`);
    expect(mail.html).toContain(`<a href="${url}">Unsubscribe</a>`);
  });

  it("adds the postal address when there is one", () => {
    const mail = renderCampaignEmail({ body: "Hi", unsubscribeUrl: url, postalAddress: "1 Main St, Austin TX" });
    expect(mail.text).toContain(`--\n1 Main St, Austin TX\nUnsubscribe: ${url}`);
    expect(mail.html).toContain("1 Main St, Austin TX<br>");
  });

  it("escapes markup typed into the body", () => {
    expect(textToHtml(`<script>alert("x")</script> & more`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more");
  });

  it("turns web addresses into links and line breaks into <br>", () => {
    expect(textToHtml("See https://example.com/a?b=1.\nBye")).toBe(
      'See <a href="https://example.com/a?b=1">https://example.com/a?b=1</a>.<br>\nBye',
    );
  });
});

describe("sending one email through the email service", () => {
  const sender = campaignSender(READY) as CampaignSender;
  const req = {
    recipientId: "r1",
    to: "me@example.com",
    subject: "News",
    email: { text: "t", html: "<p>t</p>" },
    unsubscribeUrl: "https://app.example.com/unsubscribe/tok",
    oneClickUrl: "https://app.example.com/api/unsubscribe?token=tok",
  };
  const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

  it("sends the right request, with one-click unsubscribe and a per-recipient key", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const receipt = await sendCampaignEmail(req, sender, async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    });
    expect(receipt).toEqual({ status: "accepted", messageId: "msg_1" });
    const { url, init } = seen!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("campaign-recipient-r1");
    expect(headers.authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      from: "Valiant <news@news.example.com>",
      to: ["me@example.com"],
      subject: "News",
      text: "t",
      html: "<p>t</p>",
      headers: {
        "List-Unsubscribe": "<https://app.example.com/api/unsubscribe?token=tok>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  });

  it("reports a refusal with the service's own reason", async () => {
    expect(await sendCampaignEmail(req, sender, answer(403, { message: "The domain is not verified" }))).toEqual({
      status: "rejected",
      error: "The domain is not verified",
    });
    expect(await sendCampaignEmail(req, sender, answer(422, {}))).toEqual({ status: "rejected", error: "HTTP 422" });
  });

  it("waits, rather than failing, when the service is busy or a limit is reached", async () => {
    for (const status of [429, 409, 500, 503]) {
      expect(await sendCampaignEmail(req, sender, answer(status, {}))).toEqual({ status: "retry", error: `HTTP ${status}` });
    }
    const down = async () => {
      throw new Error("network");
    };
    expect(await sendCampaignEmail(req, sender, down)).toEqual({ status: "retry", error: "No response from the email service" });
  });
});

describe("campaign numbers", () => {
  const counts = countsFrom([
    { status: "pending", count: 4 },
    { status: "sending", count: 1 },
    { status: "sent", count: 10 },
    { status: "unsubscribed", count: 2 },
    { status: "bounced", count: 1 },
    { status: "failed", count: 3 },
    { status: "skipped", count: 6 },
  ]);

  it("folds recipient statuses", () => {
    expect(counts).toEqual({ pending: 5, sent: 10, failed: 3, skipped: 6, unsubscribed: 2, bounced: 1 });
  });

  it("uses only accepted emails as the base for an open rate", () => {
    expect(deliveredBase(counts)).toBe(12);
  });

  it("says plainly what happened", () => {
    expect(countsLine(counts)).toBe("13 sent · 5 waiting · 1 bounced · 3 refused · 6 skipped");
    expect(countsLine(countsFrom([{ status: "sent", count: 1 }]))).toBe("1 sent");
    expect(countsLine(countsFrom([{ status: "skipped", count: 2 }]))).toBe("0 sent · 2 skipped");
  });

  it("has a readable alert label", () => {
    expect(formatNotification({ event: "campaign_sent", title: "June news: 1 sent" }).subject).toBe("Email campaign sent: June news: 1 sent");
  });
});

describe("pasted email addresses", () => {
  it("finds addresses separated by lines, commas, semicolons or spaces", () => {
    expect(parseEmails("A@example.com\nb@example.com, c@example.com;d@example.com  e@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
      "e@example.com",
    ]);
  });

  it("drops duplicates and anything that is not an address", () => {
    expect(parseEmails("a@example.com, A@EXAMPLE.com, hello, @x.com, a@b")).toEqual(["a@example.com"]);
    expect(parseEmails("")).toEqual([]);
  });
});

describe("a test copy for the owner", () => {
  const sender = campaignSender(READY) as CampaignSender;
  const campaign = { id: "c1", subject: "June news", body: "Hello" };
  const at = new Date("2026-11-25T10:00:00Z");

  it("is clearly marked as a test and goes only to the given inbox", () => {
    const req = buildTestEmail(campaign, "me@example.com", sender, at);
    expect(req.to).toBe("me@example.com");
    expect(req.subject).toBe("[Test] June news");
    expect(req.email.text.startsWith(`${TEST_NOTE}\n\nHello`)).toBe(true);
    expect(req.oneClickUrl).toBeNull();
  });

  it("uses a fresh key each time, so a second test is not swallowed", () => {
    const a = buildTestEmail(campaign, "me@example.com", sender, at);
    const b = buildTestEmail(campaign, "me@example.com", sender, new Date(at.getTime() + 1));
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it("is sent without one-click unsubscribe headers", async () => {
    let body: Record<string, unknown> = {};
    let key = "";
    await sendCampaignEmail(buildTestEmail(campaign, "me@example.com", sender, at), sender, async (_url, init) => {
      body = JSON.parse(String(init.body));
      key = (init.headers as Record<string, string>)["Idempotency-Key"]!;
      return new Response(JSON.stringify({ id: "m" }), { status: 200 });
    });
    expect(body.headers).toBeUndefined();
    expect(body.to).toEqual(["me@example.com"]);
    expect(key).toBe(`campaign-test-c1-${at.getTime()}`);
  });
});

describe("the recipient list", () => {
  const base = { status: "sent", error: null, sentAt: null, openedAt: null, clickedAt: null };
  const fmt = () => "TIME";

  it("uses plain words for each status", () => {
    expect(["pending", "sending", "sent", "failed", "skipped", "unsubscribed", "bounced"].map(recipientLabel)).toEqual([
      "Waiting",
      "Sending",
      "Sent",
      "Refused",
      "Skipped",
      "Unsubscribed",
      "Bounced",
    ]);
    expect(recipientLabel("something-new")).toBe("something-new");
  });

  it("gives the reason for a skipped or refused address", () => {
    expect(recipientDetail({ ...base, status: "skipped", error: "Not on the allowed recipient list" }, fmt)).toBe("Not on the allowed recipient list");
    expect(recipientDetail({ ...base, status: "failed", error: "Invalid address" }, fmt)).toBe("Invalid address");
  });

  it("shows the latest thing known about a sent email", () => {
    expect(recipientDetail({ ...base, sentAt: "2026-11-25T10:00:00Z" }, fmt)).toBe("Sent TIME");
    expect(recipientDetail({ ...base, sentAt: "x", openedAt: "y" }, fmt)).toBe("Opened TIME");
    expect(recipientDetail({ ...base, sentAt: "x", openedAt: "y", clickedAt: "z" }, fmt)).toBe("Clicked TIME");
    expect(recipientDetail({ ...base, status: "pending" }, fmt)).toBe("");
  });
});
