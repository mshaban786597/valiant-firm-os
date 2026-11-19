import crypto from "node:crypto";

/**
 * Pure helpers for website enquiries: read whatever a form sends into a
 * consistent shape, spot bot submissions, and recognise a repeat.
 */
export { LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/site-leads/status";

export interface NormalizedLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  pageUrl: string | null;
  formName: string | null;
  /** Fields that did not map to anything above, kept as sent. */
  extra: Record<string, string>;
  honeypot: boolean;
}

const squash = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

// Field names used by common form builders (plain HTML, Contact Form 7, Elementor, WPForms, Gravity).
const NAME_KEYS = ["name", "fullname", "yourname", "contactname", "customername", "formfieldsname"];
const FIRST_KEYS = ["firstname", "fname", "first"];
const LAST_KEYS = ["lastname", "lname", "last", "surname"];
const EMAIL_KEYS = ["email", "emailaddress", "youremail", "mail", "formfieldsemail"];
const PHONE_KEYS = ["phone", "phonenumber", "tel", "telephone", "mobile", "yourphone", "yourtel", "cell", "formfieldsphone"];
const MESSAGE_KEYS = ["message", "yourmessage", "comments", "comment", "details", "description", "enquiry", "inquiry", "notes", "howcanwehelp", "formfieldsmessage", "projectdetails"];
const PAGE_KEYS = ["page", "pageurl", "url", "referrer", "referer", "sourceurl", "landingpage"];
const FORM_KEYS = ["form", "formname", "formid", "formtitle", "subject"];
// Hidden fields a person never fills in; a value here means a bot.
const HONEYPOT_KEYS = ["gotcha", "honeypot", "hp", "websiteurlhp", "leaveblank", "botfield"];
// Never stored: anti-bot tokens and internal plumbing, not part of the enquiry.
const DROP = /^(cfturnstileresponse|grecaptcharesponse|hcaptcharesponse|token|csrf|nonce|wpnonce|wpcf7.*|action|submit|test)$/;

function clean(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const t = (Array.isArray(v) ? v.join(", ") : String(v)).replace(/\u0000/g, "").trim();
  return t ? t.slice(0, max) : null;
}

export function normalizeEmail(v: string | null): string | null {
  if (!v) return null;
  const e = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e.slice(0, 200) : null;
}

/** Digits only, for comparing; "(850) 819-6031" and "850.819.6031" are the same number. */
export function phoneDigits(v: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 && d[0] === "1" ? d.slice(1) : d;
}

export function normalizeSubmission(input: Record<string, unknown>): NormalizedLead {
  const flat: Record<string, string> = {};
  Object.keys(input).forEach((k) => {
    const v = clean(input[k], 5000);
    if (v !== null) flat[k] = v;
  });
  const used: Record<string, true> = {};
  const pick = (keys: string[]): string | null => {
    for (const k of Object.keys(flat)) {
      if (keys.indexOf(squash(k)) !== -1) {
        used[k] = true;
        return flat[k]!;
      }
    }
    return null;
  };

  const honeypot = Object.keys(flat).some((k) => HONEYPOT_KEYS.indexOf(squash(k)) !== -1 && (used[k] = true));
  let name = pick(NAME_KEYS);
  const first = pick(FIRST_KEYS);
  const last = pick(LAST_KEYS);
  if (!name && (first || last)) name = [first, last].filter(Boolean).join(" ");
  const email = normalizeEmail(pick(EMAIL_KEYS));
  const phoneRaw = pick(PHONE_KEYS);
  const message = pick(MESSAGE_KEYS);
  const pageUrl = pick(PAGE_KEYS);
  const formName = pick(FORM_KEYS);

  const extra: Record<string, string> = {};
  Object.keys(flat).forEach((k) => {
    if (used[k] || DROP.test(squash(k))) return;
    if (Object.keys(extra).length < 30) extra[k.slice(0, 80)] = flat[k]!.slice(0, 1000);
  });

  return {
    name: name ? name.slice(0, 160) : null,
    email,
    phone: phoneRaw ? phoneRaw.slice(0, 40) : null,
    message: message ? message.slice(0, 5000) : null,
    pageUrl: pageUrl && /^https?:\/\//i.test(pageUrl) ? pageUrl.slice(0, 500) : null,
    formName: formName ? formName.slice(0, 120) : null,
    extra,
    honeypot,
  };
}

/** A lead needs a way to reach the person, or at least something they wrote. */
export function hasContent(l: NormalizedLead): boolean {
  return !!(l.email || phoneDigits(l.phone).length >= 7 || l.message || Object.keys(l.extra).length);
}

/**
 * The same person sending the same thing within the same ten minutes is one
 * lead (double clicks, a form that retries). Later repeats are kept.
 */
export function dedupeKey(l: NormalizedLead, at: Date): string {
  const bucket = Math.floor(at.getTime() / 600_000);
  const who = `${l.email ?? ""}|${phoneDigits(l.phone)}|${(l.name ?? "").toLowerCase()}`;
  const what = (l.message ?? JSON.stringify(l.extra)).toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(`${who}|${what}|${bucket}`).digest("hex").slice(0, 40);
}

/** Browser requests are accepted only from the site's own address. */
export function allowedOrigin(siteDomain: string, origin: string | null): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.protocol === "https:" && host === siteDomain.toLowerCase().replace(/^www\./, "") ? origin : null;
  } catch {
    return null;
  }
}

export function newIntakeKey(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** "Sam Carter · 850-555-0100 · sam@example.com" for lists and alerts. */
export function leadSummary(l: { name: string | null; email: string | null; phone: string | null }): string {
  return [l.name, l.phone, l.email].filter(Boolean).join(" · ") || "No contact details";
}
