import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  businessNameFrom,
  classifyResults,
  domainOf,
  extractEmails,
  isDirectory,
  mentionsPlace,
  siteNameFrom,
  websiteFindings,
} from "@/lib/prospecting/rules";
import { buildFollowUp, buildOutreachDraft, outreachFooter } from "@/lib/outreach/draft";
import { eventTypeOf, verifySvixSignature } from "@/lib/outreach/events";
import { groupOutreachStats, prospectStage, type StatLead } from "@/lib/prospecting/stats";
import { prospectTargetSchema } from "@/lib/schemas/prospecting";

describe("prospecting rules", () => {
  it("reads the domain from a URL, with or without a scheme", () => {
    expect(domainOf("https://www.Acme-Gutters.com/services")).toBe("acme-gutters.com");
    expect(domainOf("acmegutters.com")).toBe("acmegutters.com");
    expect(domainOf("http://")).toBeNull();
  });

  it("treats directories, social networks and public bodies as not a business", () => {
    ["yelp.com", "m.yelp.com", "angi.com", "www.bbb.org".replace("www.", ""), "facebook.com", "tallahassee.gov", "fsu.edu"].forEach((d) =>
      expect(isDirectory(d)).toBe(true),
    );
    ["acmegutters.com", "bigbendgutters.com", "googleplexroofing.com"].forEach((d) => expect(isDirectory(d)).toBe(false));
  });

  it("keeps only page 2 to 5 businesses and says why the rest were skipped", () => {
    const r = classifyResults(
      [
        { position: 1, url: "https://topgutters.com/", title: "Top" },
        { position: 12, url: "https://www.yelp.com/search?x", title: "Yelp" },
        { position: 14, url: "https://acmegutters.com/", title: "Acme" },
        { position: 15, url: "https://acmegutters.com/about", title: "Acme about" },
        { position: 18, url: "https://bigbendgutters.com/", title: "Ours" },
        { position: 22, url: "https://knownlead.com/", title: "Known" },
        { position: 64, url: "https://deepgutters.com/", title: "Deep" },
        { position: 30, url: "https://newvision.example/", title: "NV" },
      ],
      { ownDomains: ["www.bigbendgutters.com"], existingDomains: ["knownlead.com"] },
    );
    expect(r.picked.map((p) => p.domain)).toEqual(["acmegutters.com", "newvision.example"]);
    const reasons: Record<string, string> = {};
    r.skipped.forEach((s) => (reasons[s.domain] = s.reason));
    expect(reasons["topgutters.com"]).toBe("top_ranked");
    expect(reasons["yelp.com"]).toBe("directory");
    expect(reasons["bigbendgutters.com"]).toBe("own_site");
    expect(reasons["knownlead.com"]).toBe("already_a_lead");
    expect(reasons["deepgutters.com"]).toBe("too_deep");
    expect(r.skipped.filter((s) => s.reason === "duplicate_in_results")).toHaveLength(1);
  });

  it("takes the business name from the title, falling back to the domain", () => {
    expect(businessNameFrom("Acme Gutters | Seamless Gutters in Panama City, FL", "acmegutters.com")).toBe("Acme Gutters");
    expect(businessNameFrom("Seamless Gutter Installation in Tallahassee - Smith & Sons", "smithandsons.com")).toBe("Smith & Sons");
    expect(businessNameFrom("Home", "north-florida-gutters.com")).toBe("North Florida Gutters");
  });

  it("finds published emails, prefers the business's own domain, and ignores junk", () => {
    const html = `<a href="mailto:Info@AcmeGutters.com">mail</a> joe@gmail.com
      <img src="logo@2x.png"> user@example.com 1a2b3c@sentry.io sales (at) acmegutters (dot) com`;
    expect(extractEmails(html, "acmegutters.com")).toEqual(["info@acmegutters.com", "sales@acmegutters.com"].sort((a, b) => (a < b ? -1 : 1)));
    expect(extractEmails("reach us: joe@gmail.com", "acmegutters.com")).toEqual(["joe@gmail.com"]);
    expect(extractEmails("<p>No address here</p>", "acmegutters.com")).toEqual([]);
  });

  it("prefers the site's own name and never uses a cut-off title as a name", () => {
    const html = `<meta property="og:site_name" content="Tallahassee Fence &amp; Deck" />`;
    expect(siteNameFrom(html)).toBe("Tallahassee Fence & Deck");
    expect(siteNameFrom(`<meta property="og:site_name" content="Home">`)).toBeNull();
    expect(siteNameFrom("<title>x</title>")).toBeNull();
    expect(siteNameFrom(`<meta property="og:site_name" content="Superior Fence &#38; Rail">`)).toBe("Superior Fence & Rail");
    expect(siteNameFrom(`<meta content="TriCon Builders, Inc. - Roofing Company Tallahassee" property="og:site_name">`)).toBe("TriCon Builders, Inc.");
    expect(businessNameFrom("Perry Patio and Fence - Quality Fencing Solutions for North ...", "perrypatiofence.com")).toBe("Perry Patio and Fence");
    expect(businessNameFrom("anything", "tallyfenceanddeck.com", "Tallahassee Fence & Deck")).toBe("Tallahassee Fence & Deck");
    expect(businessNameFrom("Deck Builder & Fence Installer in Tallahassee, FL | AM Fence ...", "amfencedeckllc.com")).toBe("Amfencedeckllc");
    expect(businessNameFrom("Tallahassee Fence and Deck, LLC", "tallyfenceanddeck.com")).toBe("Tallahassee Fence and Deck, LLC");
    expect(businessNameFrom("My WordPress", "fenceinstallationtallahassee.com")).toBe("Fenceinstallationtallahassee");
  });

  it("never takes an address on another company's domain", () => {
    expect(extractEmails("built by info@webdesigner.io", "gomaxfencing.com")).toEqual([]);
    expect(extractEmails("info@webdesigner.io or maxfence@outlook.com", "gomaxfencing.com")).toEqual(["maxfence@outlook.com"]);
  });

  it("keeps a site only when its own page names the city", () => {
    expect(mentionsPlace("<p>Serving Tallahassee and Leon County</p>", "tallahassee")).toBe(true);
    expect(mentionsPlace("<script>var c='Tallahassee'</script><p>National directory</p>", "Tallahassee")).toBe(false);
  });

  it("reports only findings that are true of the page", () => {
    const good = `<html><head><title>Acme Gutters of Tallahassee Florida</title>
      <meta name="viewport" content="width=device-width">
      <meta name="description" content="Seamless gutter installation and repair in Tallahassee.">
      <script type="application/ld+json">{}</script></head><body><h1>Gutters</h1></body></html>`;
    expect(websiteFindings({ html: good, finalUrl: "https://acme.com/", responseMs: 400 })).toEqual([]);
    const bad = websiteFindings({ html: "<html><head><title>Home</title></head><body></body></html>", finalUrl: "http://acme.com/", responseMs: 4200 });
    expect(bad).toContain("The site does not load over HTTPS");
    expect(bad).toContain("The home page has no main heading (H1)");
    expect(bad).toContain('The home page title is only 4 characters ("Home")');
    expect(bad).toContain("The home page took 4.2 seconds to respond");
  });
});

describe("category emails", () => {
  const lead = { businessName: "Acme Gutters", niche: "Gutters", city: "Tallahassee", state: "FL" };
  const rank = { kind: "rank_observation", surface: "organic", query: "gutter installation", location: "Tallahassee, FL", position: 23, finding: "x" };

  it("writes the low-ranking email from the stored rank and site findings", () => {
    const d = buildOutreachDraft({ ...lead, outreachCategory: "low_organic_rank" }, {}, [
      rank,
      { kind: "website_finding", finding: "The home page has no meta description" },
    ]);
    expect(d.category).toBe("low_organic_rank");
    expect(d.subject).toBe('Acme Gutters is on page 3 for "gutter installation"');
    expect(d.body).toContain("came up at position 23, which is page 3");
    expect(d.body).toContain('"gutter installation" in Tallahassee, FL');
    const named = buildOutreachDraft({ ...lead, outreachCategory: "low_organic_rank" }, {}, [{ ...rank, query: "gutter installation tallahassee" }]);
    expect(named.body).toContain('"gutter installation tallahassee" and Acme Gutters');
    expect(d.body).toContain("- The home page has no meta description");
  });

  it("writes a different email for a low Maps ranking and for a weak website", () => {
    const maps = buildOutreachDraft({ ...lead, outreachCategory: "low_maps_rank" }, {}, [{ ...rank, surface: "maps", position: 9 }]);
    expect(maps.subject).toContain("#9 on Google Maps");
    const weak = buildOutreachDraft(lead, {}, [{ kind: "website_finding", finding: "The site does not load over HTTPS" }]);
    expect(weak.category).toBe("weak_website");
    expect(weak.body).toContain("- The site does not load over HTTPS");
    expect(weak.body).not.toContain("position");
  });

  it("never states a rank it does not have", () => {
    const d = buildOutreachDraft({ ...lead, outreachCategory: "low_organic_rank" }, {}, []);
    expect(d.body).not.toMatch(/position \d|page \d/);
    expect(d.subject).toBe("Quick idea for Acme Gutters in Tallahassee, FL");
  });

  it("always ends with an opt-out, and adds the booking link and postal address when set", () => {
    const opts = { sender: "Valiant Firm", bookingUrl: "https://cal.example/vf", postalAddress: "1 Main St, Tallahassee, FL" };
    const d = buildOutreachDraft(lead, opts, [rank]);
    expect(d.body).toContain("https://cal.example/vf");
    expect(d.body).toContain("1 Main St, Tallahassee, FL");
    expect(d.body).toContain('Reply "unsubscribe"');
    expect(buildOutreachDraft(lead, {}, [rank]).body).toContain('Reply "unsubscribe"');
    expect(buildFollowUp(1, opts)).toContain('Reply "unsubscribe"');
    expect(buildFollowUp(2, opts)).toContain("Last note from me");
    expect(outreachFooter({})).toContain("Valiant Firm");
  });

  it("still accepts a plain sender name (older callers)", () => {
    expect(buildOutreachDraft(lead, "Sam at Valiant").body).toContain("Sam at Valiant");
  });
});

describe("email provider events", () => {
  const secret = `whsec_${Buffer.from("test-signing-key").toString("base64")}`;
  const now = new Date("2026-11-17T12:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ type: "email.opened", data: { email_id: "abc" } });
  const sign = (b: string, t = ts) =>
    `v1,${crypto.createHmac("sha256", Buffer.from("test-signing-key")).update(`msg_1.${t}.${b}`).digest("base64")}`;

  it("accepts a correctly signed event", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: sign(body), body, now })).toBe(true);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,bad ${sign(body)}`, body, now })).toBe(true);
  });

  it("rejects a changed body, a wrong key, an old event, and a missing secret", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: sign(body), body: body + " ", now })).toBe(false);
    expect(verifySvixSignature({ secret: "whsec_b3RoZXI=", id: "msg_1", timestamp: ts, signature: sign(body), body, now })).toBe(false);
    const old = String(Number(ts) - 3600);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: old, signature: sign(body, old), body, now })).toBe(false);
    expect(verifySvixSignature({ secret: undefined, id: "msg_1", timestamp: ts, signature: sign(body), body, now })).toBe(false);
    expect(verifySvixSignature({ secret, id: null, timestamp: ts, signature: sign(body), body, now })).toBe(false);
  });

  it("maps provider event names and ignores the rest", () => {
    expect(eventTypeOf("email.opened")).toBe("opened");
    expect(eventTypeOf("email.bounced")).toBe("bounced");
    expect(eventTypeOf("email.sent")).toBeNull();
    expect(eventTypeOf(42)).toBeNull();
  });
});

describe("outreach results by category and niche", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const past = new Date("2026-11-10T12:00:00Z");
  const future = new Date("2026-11-25T12:00:00Z");
  const mk = (over: Partial<StatLead>): StatLead => ({
    id: "x",
    niche: "Gutters",
    outreachCategory: "low_organic_rank",
    email: "a@b.com",
    hasPendingDraft: false,
    sends: [],
    replies: [],
    meetings: [],
    ...over,
  });
  const leads: StatLead[] = [
    mk({ id: "1", hasPendingDraft: true }),
    mk({
      id: "2",
      sends: [
        { step: 0, status: "sent", openedAt: past, scheduledFor: past },
        { step: 1, status: "scheduled", openedAt: null, scheduledFor: past },
      ],
    }),
    mk({ id: "3", niche: "Insulation", sends: [{ step: 0, status: "sent", openedAt: null, scheduledFor: past }], replies: [{ label: "interested" }], meetings: [{ status: "confirmed" }] }),
    mk({ id: "4", niche: null, outreachCategory: null, email: null }),
  ];

  it("counts each prospect once per column", () => {
    const cat = groupOutreachStats(leads, "category", now);
    const low = cat.filter((r) => r.key === "low_organic_rank")[0]!;
    expect(low).toMatchObject({ prospects: 3, awaitingApproval: 1, sent: 2, opened: 1, followUpsDue: 1, replied: 1, interested: 1, meetings: 1 });
    expect(cat.filter((r) => r.key === "manual")[0]).toMatchObject({ prospects: 1, withEmail: 0 });
    const niche = groupOutreachStats(leads, "niche", now);
    expect(niche.map((r) => r.key)).toEqual(["Gutters", "Insulation", "Unspecified"]);
  });

  it("describes where each prospect stands", () => {
    expect(prospectStage(leads[0]!, now)).toBe("Draft waiting for approval");
    expect(prospectStage(leads[1]!, now)).toBe("Opened · follow-up 1 due now");
    expect(prospectStage(leads[2]!, now)).toBe("Meeting booked");
    expect(prospectStage(leads[3]!, now)).toBe("No email found");
    expect(
      prospectStage(mk({ sends: [{ step: 0, status: "sent", openedAt: null, scheduledFor: past }, { step: 1, status: "scheduled", openedAt: null, scheduledFor: future }] }), now),
    ).toBe("Sent · follow-up 1 scheduled");
    expect(prospectStage(mk({ canceled: undefined } as Partial<StatLead>), now)).toBe("Not drafted");
  });

  it("validates a saved search", () => {
    expect(prospectTargetSchema.safeParse({ niche: "Gutters", keyword: "gutter installation", city: "Tallahassee", state: "FL" }).success).toBe(true);
    expect(prospectTargetSchema.safeParse({ niche: "", keyword: "x", city: "", state: "" }).success).toBe(false);
  });
});
