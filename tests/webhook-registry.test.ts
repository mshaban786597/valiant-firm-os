import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProvider, verifyWebhook } from "@/lib/integrations/registry";

const provider = getProvider("gsc")!;
const SECRET = "provider-secret";

function sign(body: string, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("webhook registry fail-closed", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env[provider.secretEnv];
    delete process.env.ALLOW_UNVERIFIED_WEBHOOKS;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  const body = JSON.stringify({ event: "sync" });
  const headersWith = (sig: string) => new Headers({ "x-webhook-signature": sig });

  it("REJECTS when no secret is configured (fail-closed)", () => {
    const r = verifyWebhook(provider, body, headersWith(sign(body)));
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(false);
  });

  it("accepts unverified only with the explicit dev override", () => {
    process.env.ALLOW_UNVERIFIED_WEBHOOKS = "true";
    const r = verifyWebhook(provider, body, new Headers());
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(false);
  });

  it("accepts a correctly signed request when the secret is set", () => {
    process.env[provider.secretEnv] = SECRET;
    const r = verifyWebhook(provider, body, headersWith(sign(body)));
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
  });

  it("rejects a bad signature when the secret is set", () => {
    process.env[provider.secretEnv] = SECRET;
    const r = verifyWebhook(provider, body, headersWith(sign(body, "wrong")));
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(true);
  });

  it("returns null for an unknown provider", () => {
    expect(getProvider("nope")).toBeNull();
  });
});
