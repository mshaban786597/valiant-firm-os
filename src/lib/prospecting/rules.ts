/**
 * Pure prospecting rules: which search results are real local businesses worth
 * contacting, why (category), and how to read a contact email off their site.
 * No network, no DB.
 */
export interface SerpResult {
  position: number;
  url: string;
  title: string;
}

export type OutreachCategory = "low_organic_rank" | "low_maps_rank" | "weak_website" | "manual";

export const CATEGORY_LABEL: Record<string, string> = {
  low_organic_rank: "Low Google ranking",
  low_maps_rank: "Low Maps ranking",
  weak_website: "Weak website",
  manual: "Added by hand",
};

/** Directories, marketplaces, social networks and big brands: never a prospect. */
const NOT_A_BUSINESS = [
  "yelp.", "angi.com", "angieslist.", "homeadvisor.", "thumbtack.", "bbb.org", "yellowpages.", "houzz.",
  "nextdoor.", "mapquest.", "facebook.", "instagram.", "linkedin.", "youtube.", "tiktok.", "pinterest.",
  "x.com", "twitter.", "reddit.", "wikipedia.", "amazon.", "lowes.", "homedepot.", "google.", "bing.",
  "apple.com", "porch.com", "expertise.com", "fixr.com", "networx.", "craftjack.", "manta.com",
  "chamberofcommerce.", "superpages.", "buildzoom.", "trustpilot.", "indeed.", "glassdoor.", "ziprecruiter.",
  "forbes.", "thisoldhouse.", "bobvila.", "birdeye.", "nicelocal.", "todayshomeowner.", "homeguide.",
  "threebestrated.", "bestprosintown.", "yahoo.", "craigslist.", "ebay.", "walmart.", "menards.",
  "ecowatch.", "promatcher.", "homeyou.", "downtobid.", "modernize.", "localprobook.", "bark.com",
  "merriam-webster.", "gaf.com", "consumeraffairs.", "usnews.", "architecturaldigest.",
];

/**
 * A search for "roofer in Tallahassee" also returns national pages that are
 * not a local business. Keep a site only if its own page names the city.
 */
export function mentionsPlace(html: string, city: string): boolean {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").toLowerCase();
  return text.indexOf(city.trim().toLowerCase()) !== -1;
}

export function domainOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isDirectory(domain: string): boolean {
  if (/\.(gov|edu|mil)$/.test(domain)) return true;
  return NOT_A_BUSINESS.some((d) => (d.endsWith(".") ? domain.indexOf(d) === 0 || domain.indexOf(`.${d}`) !== -1 : domain === d || domain.endsWith(`.${d}`)));
}

export type SkipReason = "not_local" | "top_ranked" | "too_deep" | "directory" | "own_site" | "already_a_lead" | "duplicate_in_results" | "bad_url";

export interface Classified {
  picked: (SerpResult & { domain: string })[];
  skipped: { domain: string; position: number; reason: SkipReason }[];
}

/**
 * Low-rank = shown on page 2 to 5 (positions 11 to 50): the business exists
 * and is trying to rank, but is not getting the clicks. Page-1 results are
 * skipped (they do not need this pitch); anything deeper is too weak a signal.
 */
export function classifyResults(
  results: SerpResult[],
  opts: { ownDomains: string[]; existingDomains: string[]; minPosition?: number; maxPosition?: number },
): Classified {
  const min = opts.minPosition ?? 11;
  const max = opts.maxPosition ?? 50;
  const own: Record<string, true> = {};
  opts.ownDomains.forEach((d) => (own[d.toLowerCase().replace(/^www\./, "")] = true));
  const existing: Record<string, true> = {};
  opts.existingDomains.forEach((d) => (existing[d.toLowerCase().replace(/^www\./, "")] = true));
  const seen: Record<string, true> = {};
  const out: Classified = { picked: [], skipped: [] };

  results
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((r) => {
      const domain = domainOf(r.url);
      if (!domain) return void out.skipped.push({ domain: r.url, position: r.position, reason: "bad_url" });
      const skip = (reason: SkipReason) => void out.skipped.push({ domain, position: r.position, reason });
      if (seen[domain]) return skip("duplicate_in_results");
      seen[domain] = true;
      if (isDirectory(domain)) return skip("directory");
      if (own[domain]) return skip("own_site");
      if (existing[domain]) return skip("already_a_lead");
      if (r.position < min) return skip("top_ranked");
      if (r.position > max) return skip("too_deep");
      out.picked.push({ ...r, domain });
    });
  return out;
}

const GENERIC_TITLE = /^(home|homepage|welcome|contact( us)?|about( us)?|services?|my wordpress|index|untitled)$/i;

const decodeEntities = (t: string) =>
  t
    .replace(/&#(\d{2,5});/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&nbsp;/gi, " ");

/** The name the business gives itself on its own site (og:site_name), if any. */
export function siteNameFrom(html: string): string | null {
  const tag = /<meta\b[^>]*property\s*=\s*["']og:site_name["'][^>]*>/i.exec(html)?.[0];
  const content = tag ? /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag) : null;
  const full = decodeEntities((content?.[1] ?? content?.[2] ?? "").replace(/\s+/g, " ").trim());
  // "TriCon Builders, Inc. - Roofing Company Tallahassee" → keep the name, drop the tagline.
  const name = (full.split(/\s[|\u2013\u2014-]\s/)[0] ?? "").replace(/[\s|\u2013\u2014-]+$/, "").trim();
  if (name.length < 3 || name.length > 60 || GENERIC_TITLE.test(name)) return null;
  return name;
}

/**
 * Best available business name: the site's own name, else the brand part of
 * the search title, else a short whole title, else the domain.
 * "Acme Gutters | Seamless Gutters in Panama City, FL" → "Acme Gutters"
 */
export function businessNameFrom(title: string, domain: string, siteName?: string | null): string {
  if (siteName) return siteName;
  const cleaned = decodeEntities(title).replace(/\s+/g, " ").trim();
  // Search engines cut long titles with "..."; a cut part is not a name.
  const parts = cleaned
    .split(/\s[|\u2013\u2014-]\s|:\s/)
    .map((p) => p.replace(/[\s|\u2013\u2014-]+$/, "").trim())
    .filter((p) => p && !/(\.\.\.|\u2026)$/.test(p) && !GENERIC_TITLE.test(p));
  // Prefer the part that looks like a brand: shares letters with the domain.
  const key = domain.split(".")[0]!.replace(/[^a-z0-9]/g, "");
  const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const brand = parts.filter((p) => key.length >= 4 && (squash(p).indexOf(key) !== -1 || key.indexOf(squash(p)) !== -1) && p.length <= 60)[0];
  if (brand) return brand;
  const shortest = parts.filter((p) => p.length >= 3 && p.length <= 45).sort((a, b) => a.length - b.length)[0];
  if (shortest && parts.length > 1) return shortest;
  // A short, uncut title with no separators is usually just the name.
  if (parts.length === 1 && parts[0]!.split(" ").length <= 5 && parts[0]!.length <= 45) return parts[0]!;
  // Fall back to the domain, title-cased.
  return domain
    .split(".")[0]!
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mail services a small business commonly uses instead of its own domain. */
const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|aol|icloud|me|mac|protonmail|proton|comcast|att|bellsouth|verizon|embarqmail|centurylink|earthlink|cox|sbcglobal)\.(com|net|me)$/;

const JUNK_EMAIL = /(example\.|sentry|wixpress|godaddy|domain\.com|email\.com|yourdomain|@2x|\.png|\.jpg|\.webp|\.svg|noreply|no-reply|donotreply|privacy@|abuse@|postmaster@|webmaster@)/i;

/**
 * Public contact emails published on a business's own pages. An address on
 * the business's own domain is preferred; a free-mail address (Gmail, Outlook…)
 * is accepted only if nothing else is published; an address on another
 * company's domain is never used.
 */
export function extractEmails(html: string, domain: string): string[] {
  const decoded = html
    .replace(/&#64;|&commat;|\s*(?:\(at\)|\[at\])\s*/gi, "@")
    .replace(/&#46;|\s*(?:\(dot\)|\[dot\])\s*/gi, ".");
  const found: string[] = [];
  const re = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decoded)) !== null) {
    const email = m[0].toLowerCase().replace(/\.$/, "");
    if (JUNK_EMAIL.test(email)) continue;
    if (!/\.[a-z]{2,10}$/.test(email)) continue;
    if (found.indexOf(email) === -1) found.push(email);
  }
  const root = domain.replace(/^www\./, "");
  const onDomain = found.filter((e) => e.endsWith(`@${root}`) || e.endsWith(`.${root}`));
  const preferred = (list: string[]) =>
    list.slice().sort((a, b) => score(a) - score(b));
  const score = (e: string) => (/^(info|contact|hello|office|sales|support|admin|service|estimates?)@/.test(e) ? 0 : 1);
  if (onDomain.length) return preferred(onDomain);
  // An address on some other company's domain is usually the web designer or
  // a vendor, not the business: never use it.
  return preferred(found.filter((e) => FREE_MAIL.test(e)));
}

/** Verifiable website findings used to personalise the email (facts only). */
export function websiteFindings(input: { html: string; finalUrl: string; responseMs: number }): string[] {
  const { html } = input;
  const out: string[] = [];
  if (!input.finalUrl.toLowerCase().startsWith("https://")) out.push("The site does not load over HTTPS");
  if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)) out.push("The site has no mobile viewport tag, so it is not set up for phones");
  if (!/application\/ld\+json/i.test(html)) out.push("The home page has no business schema markup for Google");
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  if (!title) out.push("The home page has no title tag");
  else if (title.length < 20) out.push(`The home page title is only ${title.length} characters ("${title}")`);
  if (!/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']{20,}/i.test(html)) out.push("The home page has no meta description");
  if (!/<h1\b/i.test(html)) out.push("The home page has no main heading (H1)");
  if (input.responseMs > 3000) out.push(`The home page took ${(input.responseMs / 1000).toFixed(1)} seconds to respond`);
  return out;
}
