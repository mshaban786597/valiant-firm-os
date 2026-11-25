import { describe, expect, it, vi } from "vitest";
import {
  addBusinessDays,
  classifyReply,
  leadDedupeKey,
  planFollowUps,
  sendDecision,
  sendIdempotencyKey,
} from "@/lib/outreach/sequence";
import { compareManifests, extractManifest, unreachableManifest } from "@/lib/release/verify";
import {
  aggregateCtr,
  classifyGscStatus,
  defaultGscPeriod,
  gscQuery,
  gscTestAccess,
  propertyTypeOf,
} from "@/lib/integrations/gsc";
import { getGoogleAccessToken, parseServiceAccount } from "@/lib/integrations/google-auth";
import { authorizeChange } from "@/lib/changes/lifecycle";
import { AGENTS, agentStatus } from "@/lib/agents/registry";
import { SENDERS, channelSetup } from "@/lib/notifications/dispatch";
import { liveSendingEnabled, providerFor, recipientAllowed, testProvider } from "@/lib/outreach/engine";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

// ---- outreach sequence -------------------------------------------------------
describe("follow-up scheduling", () => {
  it("counts business days only, in the business timezone", () => {
    // Thursday 12 Nov 2026 15:00 UTC (09:00 Chicago)
    const thu = new Date("2026-11-12T15:00:00Z");
    expect(addBusinessDays(thu, 1).toISOString()).toBe("2026-11-13T15:00:00.000Z"); // Fri
    expect(addBusinessDays(thu, 2).toISOString()).toBe("2026-11-16T15:00:00.000Z"); // Mon (skips weekend)
  });
  it("uses the blueprint default: 4 business days, then 5 more", () => {
    const sent = new Date("2026-11-16T15:00:00Z"); // Monday
    const [first, second] = planFollowUps(sent);
    expect(first!.toISOString().slice(0, 10)).toBe("2026-11-20"); // Fri
    expect(second!.toISOString().slice(0, 10)).toBe("2026-11-27"); // following Fri
    expect(planFollowUps(sent, [2]).length).toBe(1);
  });
});

describe("reply classification", () => {
  const label = (t: string) => classifyReply(t).label;
  it("assigns every blueprint label", () => {
    expect(label("Sounds good, let's set up a call next week.")).toBe("interested");
    expect(label("What areas do you cover?")).toBe("question");
    expect(label("Not right now, circle back next quarter.")).toBe("later");
    expect(label("Not interested, we already have someone.")).toBe("not_interested");
    expect(label("I'm not the right person, please contact Dana instead.")).toBe("wrong_contact");
    expect(label("I am out of the office until Monday.")).toBe("out_of_office");
    expect(label("Please unsubscribe me.")).toBe("unsubscribe");
    expect(label("Delivery Status Notification: address not found")).toBe("bounce");
    expect(label("ok")).toBe("needs_review");
  });
  it("routes ambiguous and commercial replies to the owner", () => {
    expect(classifyReply("Sounds interesting but honestly we're not interested in a contract")).toEqual({
      label: "needs_review",
      needsReview: true,
    });
    expect(classifyReply("Sounds good — how much does it cost?")).toEqual({ label: "interested", needsReview: true });
    expect(classifyReply("")).toEqual({ label: "needs_review", needsReview: true });
  });
});

describe("pre-send decision", () => {
  const base = { toEmail: "a@b.co", suppressed: false, replyLabels: [], hasActiveMeeting: false };
  it("sends only when nothing blocks it", () => {
    expect(sendDecision(base)).toEqual({ send: true });
    expect(sendDecision({ ...base, replyLabels: ["out_of_office"] })).toEqual({ send: true });
  });
  it("blocks on suppression, a booking, any stopping reply or a missing address", () => {
    expect(sendDecision({ ...base, suppressed: true })).toMatchObject({ send: false });
    expect(sendDecision({ ...base, hasActiveMeeting: true })).toEqual({ send: false, cancelReason: "Meeting already booked" });
    expect(sendDecision({ ...base, replyLabels: ["not_interested"] })).toEqual({
      send: false,
      cancelReason: "Prospect replied (Not Interested)",
    });
    expect(sendDecision({ ...base, toEmail: null })).toMatchObject({ send: false });
  });
});

describe("dedup and idempotency keys", () => {
  it("merges the same business and keeps real branches apart", () => {
    const a = leadDedupeKey({ businessName: "Acme Gutters, LLC", city: "Panama City", state: "FL" });
    expect(leadDedupeKey({ businessName: "acme gutters", city: "panama city", state: "fl" })).toBe(a);
    expect(leadDedupeKey({ businessName: "Acme Gutters", city: "Tallahassee", state: "FL" })).not.toBe(a);
  });
  it("gives one deterministic key per lead and step, and a deterministic test receipt", async () => {
    expect(sendIdempotencyKey("lead_1", 0)).toBe("outreach:lead_1:0");
    const req = { to: "a@b.co", subject: "s", body: "b", idempotencyKey: "outreach:lead_1:0" };
    const [r1, r2] = await Promise.all([testProvider.send(req), testProvider.send(req)]);
    expect(r1).toEqual(r2);
    expect(r1.status).toBe("accepted");
  });
  it("never lets a demo send reach a real provider", () => {
    expect(providerFor(true, { RESEND_API_KEY: "live-key", OUTREACH_LIVE_SENDING: "true" })?.name).toBe("test");
    expect(providerFor(false, {})).toBeNull();
  });
  it("keeps real outreach email off unless it is switched on explicitly", () => {
    // A sender key alone sends nothing.
    expect(providerFor(false, { RESEND_API_KEY: "k" })).toBeNull();
    expect(liveSendingEnabled({ OUTREACH_LIVE_SENDING: "true" })).toBe(false);
    expect(providerFor(false, { RESEND_API_KEY: "k", OUTREACH_LIVE_SENDING: "true" })?.name).toBe("resend");
  });
  it("only allows real email to explicitly listed recipients", () => {
    expect(recipientAllowed("owner@client.com", {})).toBe(false); // list unset → nobody
    const env = { OUTREACH_ALLOWED_RECIPIENTS: "muhammad@valiantfirm.com" };
    expect(recipientAllowed("Muhammad@ValiantFirm.com", env)).toBe(true);
    expect(recipientAllowed("owner@client.com", env)).toBe(false);
    expect(recipientAllowed("owner@client.com", { OUTREACH_ALLOWED_RECIPIENTS: "*" })).toBe(true);
  });
});

// ---- change approval gate ------------------------------------------------------
describe("change authorization", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const future = new Date("2026-11-18T12:00:00Z");
  it("allows only an approved, unexpired change proposal", () => {
    expect(authorizeChange({ kind: "fix", status: "APPROVED", expiresAt: future }, now)).toEqual({ ok: true });
    expect(authorizeChange({ kind: "fix", status: "PENDING", expiresAt: future }, now)).toEqual({ ok: false, reason: "pending" });
    expect(authorizeChange({ kind: "fix", status: "REJECTED", expiresAt: future }, now)).toEqual({ ok: false, reason: "rejected" });
    expect(authorizeChange({ kind: "fix", status: "APPROVED", expiresAt: new Date("2026-11-17T11:59:00Z") }, now)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(authorizeChange({ kind: "outreach_email", status: "APPROVED", expiresAt: null }, now)).toEqual({
      ok: false,
      reason: "not_a_change",
    });
  });
});

// ---- release verification --------------------------------------------------------
describe("release verification", () => {
  const html = (h1: string, extra = "") =>
    `<html><head><title> Home | Site </title><meta name="viewport" content="width=device-width">` +
    `<link rel="canonical" href="https://site.com/"><script type="application/ld+json">{"@type":"LocalBusiness","x":{"@type":"PostalAddress"}}</script>${extra}</head>` +
    `<body><h1>${h1}</h1><a href="tel:123">Call</a><form action="/api/lead"></form></body></html>`;
  const m = (h: string, status = 200, url = "https://site.com/") => extractManifest({ url, status, finalUrl: url, html: h });

  it("extracts the manifest fields", () => {
    expect(m(html("Welcome"))).toMatchObject({
      status: 200, finalPath: "/", title: "Home | Site", h1: "Welcome", canonicalPath: "/", robots: null,
      schemaTypes: ["LocalBusiness", "PostalAddress"], ctaCount: 1, hasViewport: true, formActions: ["/api/lead"],
    });
  });
  it("counts expected, checked, failed and skipped", () => {
    const same = compareManifests([{ path: "/", baseline: m(html("Welcome")), candidate: m(html("Welcome"), 200, "https://staging.site.com/") }]);
    expect(same).toMatchObject({ expected: 10, checked: 10, failed: 0, skipped: 0 });

    const changed = compareManifests(
      [{ path: "/", baseline: m(html("Welcome")), candidate: m(html("Hello", '<meta name="robots" content="noindex">'), 200, "https://staging.site.com/") }],
      ["Robots"],
    );
    expect(changed).toMatchObject({ expected: 10, checked: 9, failed: 1, skipped: 1 });
    expect(changed.items.filter((i) => i.result === "fail")[0]).toMatchObject({ check: "H1", expected: "Welcome", actual: "Hello" });
  });
  it("skips checks the baseline does not define and declares an unreachable candidate", () => {
    const bare = m("<html><head><title>T</title></head><body></body></html>");
    const r = compareManifests([{ path: "/", baseline: bare, candidate: bare }]);
    expect(r.skipped).toBe(5); // H1, canonical, schema, CTAs, forms: nothing to compare
    expect(r.failed).toBe(0);
    const down = compareManifests([{ path: "/x", baseline: m(html("A")), candidate: unreachableManifest("https://staging.site.com/x") }]);
    expect(down.failed).toBe(1);
    expect(down.skipped).toBe(10);
  });
});

// ---- GSC adapter (fixture provider) -------------------------------------------------
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Search Console adapter", () => {
  it("classifies provider errors into actionable states", () => {
    expect(classifyGscStatus(401)).toBe("needs_reauth");
    expect(classifyGscStatus(403)).toBe("forbidden");
    expect(classifyGscStatus(429)).toBe("quota");
    expect(classifyGscStatus(503)).toBe("error");
    expect(classifyGscStatus(200)).toBe("ok");
  });
  it("identifies property type and computes aggregate CTR", () => {
    expect(propertyTypeOf("sc-domain:bigbendgutters.com")).toBe("domain");
    expect(propertyTypeOf("https://bigbendgutters.com/")).toBe("url_prefix");
    expect(aggregateCtr(50, 1000)).toBe(0.05);
    expect(aggregateCtr(0, 0)).toBeNull();
  });
  it("uses a 28-day window ending 3 days ago", () => {
    expect(defaultGscPeriod(new Date("2026-11-17T10:00:00Z"))).toEqual({ startDate: "2026-10-18", endDate: "2026-11-14" });
  });
  it("verifies the exact property identifier before syncing", async () => {
    const sites = { siteEntry: [{ siteUrl: "sc-domain:bigbendgutters.com", permissionLevel: "siteFullUser" }] };
    const f = vi.fn(async () => json(sites)) as unknown as typeof fetch;
    expect(await gscTestAccess("t", "sc-domain:bigbendgutters.com", f)).toEqual({ ok: true, data: { permissionLevel: "siteFullUser" } });
    const wrong = await gscTestAccess("t", "https://bigbendgutters.com/", f);
    expect(wrong).toMatchObject({ ok: false, state: "forbidden" });
  });
  it("paginates until a short page and stops on a provider error without partial data", async () => {
    const page = (n: number, start: number) => ({
      rows: Array.from({ length: n }, (_, i) => ({ keys: [`q${start + i}`], clicks: 1, impressions: 10, position: 5 })),
    });
    const bodies: number[] = [];
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const startRow = JSON.parse(String(init?.body)).startRow as number;
      bodies.push(startRow);
      return json(startRow === 0 ? page(2, 0) : startRow === 2 ? page(2, 2) : page(1, 4));
    }) as unknown as typeof fetch;
    const r = await gscQuery({ token: "t", siteUrl: "sc-domain:x.com", startDate: "2026-10-18", endDate: "2026-11-14", dimension: "query", rowLimit: 2, fetchImpl: f });
    expect(bodies).toEqual([0, 2, 4]);
    expect(r.ok && r.data.length).toBe(5);

    const quota = vi.fn(async () => json({ error: "quota" }, 429)) as unknown as typeof fetch;
    expect(await gscQuery({ token: "t", siteUrl: "sc-domain:x.com", startDate: "a", endDate: "b", dimension: "page", fetchImpl: quota })).toMatchObject({
      ok: false,
      state: "quota",
    });
  });
  it("reports a missing or malformed credential without calling Google", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await getGoogleAccessToken(["s"], {}, f)).toMatchObject({ ok: false, kind: "not_configured" });
    expect(await getGoogleAccessToken(["s"], { GOOGLE_SERVICE_ACCOUNT_JSON: "{not json" }, f)).toMatchObject({
      ok: false,
      kind: "invalid_credentials",
    });
    expect(f).not.toHaveBeenCalled();
    expect(parseServiceAccount('{"client_email":"a@b.iam","private_key":"k\\\\nk"}')).toEqual({ client_email: "a@b.iam", private_key: "k\nk" });
  });
});

// ---- alert channel adapters (fixture provider) -----------------------------------------
describe("alert channel adapters", () => {
  const msg = { subject: "Test: hello", text: "Test: hello" };
  it("email: sends to the configured recipient and keeps the provider reference", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: "re_123" }));
    const out = await SENDERS.email(msg, { RESEND_API_KEY: "k", ALERT_EMAIL_TO: "muhammad@valiantfirm.com" });
    expect(out).toEqual({ error: null, ref: "re_123" });
    const body = JSON.parse(String(f.mock.calls[0]![1]!.body));
    expect(body.to).toEqual(["muhammad@valiantfirm.com"]);
    f.mockRestore();
  });
  it("telegram keeps the message id; slack has no reference; a rejection is a failure", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ ok: true, result: { message_id: 77 } }));
    expect(await SENDERS.telegram(msg, { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" })).toEqual({ error: null, ref: "77" });
    f.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    expect(await SENDERS.slack(msg, { SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" })).toEqual({ error: null, ref: null });
    f.mockResolvedValueOnce(json({ message: "bad key" }, 401));
    expect(await SENDERS.email(msg, { RESEND_API_KEY: "bad", ALERT_EMAIL_TO: "a@b.co" })).toEqual({ error: "HTTP 401", ref: null });
    f.mockRestore();
  });
  it("names exactly what each channel still needs", () => {
    expect(channelSetup({})).toEqual({
      email: ["RESEND_API_KEY", "ALERT_EMAIL_TO"],
      slack: ["SLACK_WEBHOOK_URL"],
      telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    });
    expect(channelSetup({ ALERT_EMAIL_TO: "muhammad@valiantfirm.com" }).email).toEqual(["RESEND_API_KEY"]);
  });
});

// ---- agents ------------------------------------------------------------------------------
describe("agent registry", () => {
  it("registers the five agents with a fallback worker each", () => {
    expect(AGENTS.map((a) => a.id)).toEqual(["openclaw", "hermes", "claude", "claude-code", "atomic"]);
    AGENTS.forEach((a) => {
      expect(a.fallbackWorker.length).toBeGreaterThan(5);
      expect(a.permissions.length).toBeGreaterThan(0);
    });
  });
  it("reports a named runtime as connected only when it is configured", () => {
    const openclaw = AGENTS[0]!;
    expect(agentStatus(openclaw, {})).toEqual({ runtimeConnected: false, servedBy: openclaw.fallbackWorker });
    expect(agentStatus(openclaw, { OPENCLAW_URL: "https://claw.internal" }).runtimeConnected).toBe(true);
    expect(agentStatus(AGENTS[3]!, { OPENCLAW_URL: "x" }).runtimeConnected).toBe(false); // Claude Code has no in-app runtime
  });
});
