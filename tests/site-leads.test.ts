import { describe, expect, it } from "vitest";
import {
  allowedOrigin,
  dedupeKey,
  hasContent,
  leadSummary,
  newIntakeKey,
  normalizeEmail,
  normalizeSubmission,
  phoneDigits,
} from "@/lib/site-leads/parse";

describe("website enquiry parsing", () => {
  it("reads a plain form post", () => {
    const l = normalizeSubmission({
      name: " Sam Carter ",
      email: "Sam@Example.com",
      phone: "(850) 555-0100",
      message: "Need a quote for gutters",
      page: "https://bigbendgutters.com/contact",
      service: "Gutter guards",
    });
    expect(l).toMatchObject({
      name: "Sam Carter",
      email: "sam@example.com",
      phone: "(850) 555-0100",
      message: "Need a quote for gutters",
      pageUrl: "https://bigbendgutters.com/contact",
      honeypot: false,
    });
    expect(l.extra).toEqual({ service: "Gutter guards" });
  });

  it("understands the field names form builders use", () => {
    const cf7 = normalizeSubmission({ "your-name": "Ana", "your-email": "ana@example.com", "your-message": "Hi", "your-tel": "850 555 0101" });
    expect(cf7).toMatchObject({ name: "Ana", email: "ana@example.com", message: "Hi", phone: "850 555 0101" });
    const split = normalizeSubmission({ first_name: "Jo", last_name: "Lee", Email: "jo@example.com", Comments: "Call me" });
    expect(split).toMatchObject({ name: "Jo Lee", email: "jo@example.com", message: "Call me" });
  });

  it("drops anti-bot tokens and keeps a bad email out of the email field", () => {
    const l = normalizeSubmission({ name: "Sam", email: "not-an-email", "cf-turnstile-response": "abc", _wpnonce: "x", action: "send" });
    expect(l.email).toBeNull();
    expect(l.extra).toEqual({});
    expect(normalizeEmail("  A@B.co ")).toBe("a@b.co");
  });

  it("flags a filled hidden field as a bot", () => {
    expect(normalizeSubmission({ name: "x", email: "x@example.com", _gotcha: "http://spam" }).honeypot).toBe(true);
    expect(normalizeSubmission({ name: "x", email: "x@example.com", _gotcha: "" }).honeypot).toBe(false);
  });

  it("refuses a form with nothing in it, accepts one with only a phone number", () => {
    expect(hasContent(normalizeSubmission({ name: "Sam" }))).toBe(false);
    expect(hasContent(normalizeSubmission({ name: "Sam", phone: "850-555-0100" }))).toBe(true);
    expect(hasContent(normalizeSubmission({}))).toBe(false);
  });

  it("treats the same enquiry within ten minutes as one, and a later one as new", () => {
    const a = normalizeSubmission({ email: "sam@example.com", phone: "(850) 555-0100", message: "Need  a quote" });
    const b = normalizeSubmission({ email: "SAM@example.com", phone: "850.555.0100", message: "need a quote" });
    const t = new Date("2026-11-19T10:01:00Z");
    expect(dedupeKey(a, t)).toBe(dedupeKey(b, new Date("2026-11-19T10:08:00Z")));
    expect(dedupeKey(a, t)).not.toBe(dedupeKey(a, new Date("2026-11-19T11:30:00Z")));
    expect(dedupeKey(a, t)).not.toBe(dedupeKey(normalizeSubmission({ email: "sam@example.com", message: "Different" }), t));
    expect(phoneDigits("+1 (850) 555-0100")).toBe("8505550100");
  });

  it("accepts browser requests only from the website's own address", () => {
    expect(allowedOrigin("bigbendgutters.com", "https://www.bigbendgutters.com")).toBe("https://www.bigbendgutters.com");
    expect(allowedOrigin("bigbendgutters.com", "https://bigbendgutters.com")).toBe("https://bigbendgutters.com");
    expect(allowedOrigin("bigbendgutters.com", "https://evil.example")).toBeNull();
    expect(allowedOrigin("bigbendgutters.com", "http://bigbendgutters.com")).toBeNull();
    expect(allowedOrigin("bigbendgutters.com", "https://bigbendgutters.com.evil.example")).toBeNull();
    expect(allowedOrigin("bigbendgutters.com", null)).toBeNull();
  });

  it("makes long unguessable intake keys and a readable summary", () => {
    const a = newIntakeKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(newIntakeKey());
    expect(leadSummary({ name: "Sam", phone: "850-555-0100", email: null })).toBe("Sam · 850-555-0100");
    expect(leadSummary({ name: null, phone: null, email: null })).toBe("No contact details");
  });
});
