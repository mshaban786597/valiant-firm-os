import { describe, expect, it } from "vitest";

import type { ProcessSummary } from "@/lib/outreach/engine";
import { outreachRunAlerts } from "@/lib/outreach/run-alerts";
import { seenText, type SeenInput } from "@/lib/outreach/seen";
import { formatNotification } from "@/lib/notifications/dispatch";

const run = (over: Partial<ProcessSummary> = {}): ProcessSummary => ({
  due: 0,
  sent: 0,
  canceled: 0,
  failed: 0,
  needsReconcile: 0,
  skippedNoProvider: 0,
  heldNotAllowed: 0,
  heldDailyLimit: 0,
  ...over,
});

describe("alerts for a sending run", () => {
  it("stays quiet when nothing was sent and nothing went wrong", () => {
    expect(outreachRunAlerts(run())).toEqual([]);
    // Held or canceled emails are normal, not news.
    expect(outreachRunAlerts(run({ due: 9, canceled: 2, heldDailyLimit: 7, heldNotAllowed: 3, skippedNoProvider: 4 }))).toEqual([]);
  });

  it("says how many emails went out", () => {
    expect(outreachRunAlerts(run({ sent: 1 }))).toEqual([
      { event: "outreach_sent", title: "1 email sent", body: "Sent from your outreach mailbox." },
    ]);
    expect(outreachRunAlerts(run({ sent: 5, heldDailyLimit: 3 }))[0]).toEqual({
      event: "outreach_sent",
      title: "5 emails sent",
      body: "Sent from your outreach mailbox. 3 emails wait for the daily allowance.",
    });
  });

  it("warns about refused and unclear sends", () => {
    const [alert] = outreachRunAlerts(run({ failed: 1, needsReconcile: 1 }), 1);
    expect(alert).toMatchObject({
      event: "outreach_problem",
      severity: "warning",
      title: "1 email refused by the mail server; 2 emails with an unclear result (not retried, to avoid sending twice)",
    });
  });

  it("reports both what was sent and what went wrong in the same run", () => {
    expect(outreachRunAlerts(run({ sent: 2, failed: 1 })).map((a) => a.event)).toEqual(["outreach_sent", "outreach_problem"]);
  });

  it("has a readable label for every outreach alert", () => {
    expect(formatNotification({ event: "outreach_sent", title: "1 email sent" }).subject).toBe("Outreach sent: 1 email sent");
    expect(formatNotification({ event: "outreach_reply", title: "Acme: Interested" }).subject).toBe("Prospect replied: Acme: Interested");
    expect(formatNotification({ event: "outreach_problem", title: "1 email refused", severity: "warning" }).subject).toBe(
      "Outreach needs attention [WARNING]: 1 email refused",
    );
  });
});

describe("what is known about a sent email", () => {
  const sent: SeenInput = { status: "sent", provider: "mailbox", deliveredAt: null, openedAt: null, openCount: 0, clickedAt: null };
  const fmt = () => "TIME";

  it("does not claim a mailbox email was unopened", () => {
    expect(seenText(sent)).toBe("Sent from your mailbox (opens are not tracked)");
  });

  it("waits for a report from a tracking service", () => {
    expect(seenText({ ...sent, provider: "resend" })).toBe("No delivery report yet");
    expect(seenText({ ...sent, provider: "resend", deliveredAt: new Date() })).toBe("Delivered, not opened");
  });

  it("shows opens and clicks when they were reported", () => {
    expect(seenText({ ...sent, provider: "resend", openedAt: new Date(), openCount: 3 }, fmt)).toBe("Opened TIME (3×)");
    expect(seenText({ ...sent, provider: "resend", openedAt: new Date(), openCount: 1, clickedAt: new Date() }, fmt)).toBe("Clicked TIME");
  });

  it("shows nothing for an email that has not gone out", () => {
    expect(seenText({ ...sent, status: "scheduled" })).toBe("—");
    expect(seenText({ ...sent, status: "canceled" })).toBe("—");
  });
});
