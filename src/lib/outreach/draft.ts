/**
 * Outreach email drafts. Each prospect category gets its own email, built only
 * from facts stored on the lead and its evidence. Nothing is invented.
 *
 * Every email ends with a footer that lets the recipient opt out and, when
 * configured, gives the sender's postal address (required for commercial email
 * in the US). Drafts are never sent from here.
 */
export interface DraftLead {
  businessName: string;
  niche?: string | null;
  city?: string | null;
  state?: string | null;
  websiteStatus?: string | null;
  gbpStatus?: string | null;
  outreachAngle?: string | null;
  recommendedOffer?: string | null;
  outreachCategory?: string | null;
}

export interface DraftEvidence {
  kind: string;
  surface?: string | null;
  query?: string | null;
  location?: string | null;
  position?: number | null;
  finding: string;
}

export interface DraftOptions {
  sender?: string;
  /** Link the prospect can use to book a call. */
  bookingUrl?: string | null;
  /** Sender's postal address for the footer. */
  postalAddress?: string | null;
}

type Env = Record<string, string | undefined>;

export function draftOptionsFromEnv(env: Env = process.env): DraftOptions {
  return {
    sender: env.OUTREACH_SENDER_NAME || "Valiant Firm",
    bookingUrl: env.OUTREACH_BOOKING_URL || null,
    postalAddress: env.OUTREACH_POSTAL_ADDRESS || null,
  };
}

export function outreachFooter(opts: DraftOptions): string {
  const lines = ["", "--", opts.sender ?? "Valiant Firm"];
  if (opts.postalAddress) lines.push(opts.postalAddress);
  lines.push('Not interested? Reply "unsubscribe" and you will not hear from us again.');
  return lines.join("\n");
}

const callLine = (opts: DraftOptions) =>
  opts.bookingUrl
    ? `If it is useful, you can pick a 15-minute slot here: ${opts.bookingUrl}`
    : "Open to a 15-minute call this week? I can walk you through it, no obligation.";

const place = (lead: DraftLead) => [lead.city, lead.state].filter(Boolean).join(", ");
const service = (lead: DraftLead) => (lead.niche ? lead.niche.toLowerCase() : "local service");

/** " in Tallahassee, FL", unless the search phrase already names the city. */
function inPlace(e: DraftEvidence): string {
  if (!e.location) return "";
  const city = e.location.split(",")[0]!.trim().toLowerCase();
  return city && (e.query ?? "").toLowerCase().indexOf(city) !== -1 ? "" : ` in ${e.location}`;
}

/** Up to two checked website findings, worded as bullet points. */
function siteBullets(evidence: DraftEvidence[]): string[] {
  return evidence
    .filter((e) => e.kind === "website_finding")
    .slice(0, 2)
    .map((e) => `- ${e.finding}`);
}

export function buildOutreachDraft(
  lead: DraftLead,
  optsOrSender: DraftOptions | string = {},
  evidence: DraftEvidence[] = [],
): { subject: string; body: string; category: string } {
  const opts: DraftOptions = typeof optsOrSender === "string" ? { sender: optsOrSender } : optsOrSender;
  const where = place(lead);
  const rank = evidence.filter((e) => e.kind === "rank_observation" && e.surface !== "maps" && e.position)[0];
  const maps = evidence.filter((e) => e.kind === "rank_observation" && e.surface === "maps" && e.position)[0];
  const bullets = siteBullets(evidence);
  const category =
    lead.outreachCategory ?? (rank ? "low_organic_rank" : maps ? "low_maps_rank" : bullets.length ? "weak_website" : "manual");

  const lines: string[] = [`Hi ${lead.businessName} team,`, ""];
  let subject: string;

  if (category === "low_organic_rank" && rank) {
    subject = `${lead.businessName} is on page ${Math.ceil(rank.position! / 10)} for "${rank.query}"`;
    lines.push(
      `I searched Google for "${rank.query}"${inPlace(rank)} and ${lead.businessName} came up at position ${rank.position}, which is page ${Math.ceil(rank.position! / 10)}.`,
      "Most people choose from the first few results, so the calls for that search are going to the businesses above you.",
    );
    if (bullets.length) lines.push("", "On your site I also noticed:", ...bullets);
    lines.push("", "I help local service businesses move up for searches like that one.");
  } else if (category === "low_maps_rank" && maps) {
    subject = `${lead.businessName} is #${maps.position} on Google Maps for "${maps.query}"`;
    lines.push(
      `I looked up "${maps.query}"${inPlace(maps)} on Google Maps and ${lead.businessName} showed at #${maps.position}.`,
      "Only the top three get shown without scrolling, and that is where most of the calls come from.",
    );
    if (lead.gbpStatus) lines.push("", `On your Google Business Profile I noticed: ${lead.gbpStatus}.`);
    lines.push("", "A stronger profile and a few local signals usually move a listing up.");
  } else if (category === "weak_website" && bullets.length) {
    subject = where ? `A few fixes for ${lead.businessName}'s website` : `A few fixes for ${lead.businessName}`;
    lines.push(`I had a look at ${lead.businessName}'s website and found a few things that cost you visitors:`, ...bullets);
    lines.push("", "They are quick to fix and they affect how Google ranks the site.");
  } else {
    subject = where ? `Quick idea for ${lead.businessName} in ${where}` : `Quick idea for ${lead.businessName}`;
    lines.push(
      lead.outreachAngle
        ? lead.outreachAngle
        : `I was looking at ${service(lead)} businesses${where ? ` in ${where}` : ""} and reviewed your online presence.`,
    );
    const noticed: string[] = [];
    if (lead.websiteStatus) noticed.push(`- Website: ${lead.websiteStatus}`);
    if (lead.gbpStatus) noticed.push(`- Google Business Profile: ${lead.gbpStatus}`);
    if (noticed.length) lines.push("", "What I noticed:", ...noticed);
  }

  lines.push(
    "",
    lead.recommendedOffer
      ? `What I would suggest: ${lead.recommendedOffer}.`
      : "I can send a short, free write-up of exactly what I would change.",
    "",
    callLine(opts),
  );
  return { subject, body: lines.join("\n") + "\n" + outreachFooter(opts), category };
}

/** Follow-up emails: short, same thread, same footer. */
export function buildFollowUp(step: number, opts: DraftOptions = {}): string {
  const text =
    step === 1
      ? "Following up on my note below in case it got buried. Happy to send the short write-up either way."
      : "Last note from me. If the timing is off I will leave it here; the offer of the write-up stands.";
  return `${text}\n${opts.bookingUrl && step === 1 ? `\nBook a time: ${opts.bookingUrl}\n` : ""}${outreachFooter(opts)}`;
}
