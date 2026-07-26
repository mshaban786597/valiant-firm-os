import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/lib/webhooks";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature (HMAC-SHA256)", () => {
  const original = process.env.WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = original;
  });

  const body = JSON.stringify({ event: "lead.created", id: "abc" });

  it("accepts a correct signature", () => {
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it("accepts a signature carrying the sha256= prefix", () => {
    expect(verifyWebhookSignature(body, `sha256=${sign(body)}`)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebhookSignature(body + " ", sign(body))).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "wrong-secret"))).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it("rejects malformed (non-hex) signatures without throwing", () => {
    expect(verifyWebhookSignature(body, "sha256=not-hex-zzz")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.WEBHOOK_SECRET;
    expect(verifyWebhookSignature(body, sign(body))).toBe(false);
  });
});
