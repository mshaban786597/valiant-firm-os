import { describe, expect, it } from "vitest";

import { channelStatus } from "@/lib/notifications/dispatch";

/**
 * The test run must never reach a real service. This once sent real "New lead"
 * alerts to Telegram from a route test, so both guards are pinned here.
 */
describe("tests are offline", () => {
  it("has no alert channel configured, whatever .env holds", () => {
    expect(channelStatus()).toEqual({ email: false, slack: false, telegram: false });
  });

  it("has no AI or Google credential", () => {
    expect(process.env.ANTHROPIC_API_KEY).toBe("");
    expect(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).toBe("");
  });

  it("refuses a real network call", async () => {
    await expect(fetch("https://api.telegram.org/")).rejects.toThrow("Real network call blocked in tests (api.telegram.org)");
  });
});
