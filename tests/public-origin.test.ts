import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/public-origin";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe("public address of the app", () => {
  it("uses the host the proxy forwards, not the internal listen address", () => {
    // What a shared host really sends: the app listens on 0.0.0.0:3000 behind the proxy.
    expect(publicOrigin(req("https://0.0.0.0:3000/api/x", { host: "app.valiantfirm.net" }), {})).toBe("https://app.valiantfirm.net");
    expect(publicOrigin(req("http://0.0.0.0:3000/api/x", { host: "0.0.0.0:3000", "x-forwarded-host": "app.valiantfirm.net" }), {})).toBe(
      "https://app.valiantfirm.net",
    );
    expect(publicOrigin(req("http://0.0.0.0:3000/api/x", { "x-forwarded-host": "App.ValiantFirm.net, proxy.internal" }), {})).toBe(
      "https://app.valiantfirm.net",
    );
  });

  it("falls back to the configured address when the host header is internal or missing", () => {
    const env = { NEXTAUTH_URL: "https://app.valiantfirm.net/" };
    expect(publicOrigin(req("https://0.0.0.0:3000/api/x", { host: "0.0.0.0:3000" }), env)).toBe("https://app.valiantfirm.net");
    expect(publicOrigin(req("http://127.0.0.1:3000/api/x", { host: "127.0.0.1:3000" }), env)).toBe("https://app.valiantfirm.net");
  });

  it("keeps a developer's own machine on http and its own port", () => {
    // Locally NEXTAUTH_URL may point at the hosted site; the request host still wins.
    expect(publicOrigin(req("http://localhost:3001/api/x", { host: "localhost:3001" }), { NEXTAUTH_URL: "https://app.valiantfirm.net" })).toBe(
      "http://localhost:3001",
    );
  });

  it("never builds an address from a malformed host header", () => {
    expect(publicOrigin(req("https://app.valiantfirm.net/api/x", { host: "evil.example/path?x=1" }), { NEXTAUTH_URL: "https://app.valiantfirm.net" })).toBe(
      "https://app.valiantfirm.net",
    );
    expect(publicOrigin(req("https://app.valiantfirm.net/api/x", { host: "0.0.0.0:3000" }), { NEXTAUTH_URL: "not a url" })).toBe("https://app.valiantfirm.net");
  });
});
