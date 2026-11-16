/**
 * Deterministic outreach email draft built only from fields stored on the lead.
 * No invented facts. Drafts always go through the approval queue before
 * anything is sent.
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
}

export function buildOutreachDraft(
  lead: DraftLead,
  sender = "Valiant Firm",
): { subject: string; body: string } {
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  const subject = place
    ? `Quick idea for ${lead.businessName} in ${place}`
    : `Quick idea for ${lead.businessName}`;

  const findings: string[] = [];
  if (lead.websiteStatus) findings.push(`Website: ${lead.websiteStatus}`);
  if (lead.gbpStatus) findings.push(`Google Business Profile: ${lead.gbpStatus}`);

  const lines: string[] = [`Hi ${lead.businessName} team,`, ""];
  lines.push(
    lead.outreachAngle
      ? lead.outreachAngle
      : `I was looking at ${lead.niche ? `${lead.niche.toLowerCase()} businesses` : "local businesses"}${place ? ` in ${place}` : ""} and reviewed your online presence.`,
  );
  if (findings.length) {
    lines.push("", "What I noticed:");
    findings.forEach((f) => lines.push(`- ${f}`));
  }
  lines.push(
    "",
    lead.recommendedOffer
      ? `What I would suggest: ${lead.recommendedOffer}.`
      : "I have a couple of specific fixes in mind that usually bring in more calls.",
    "",
    "Open to a 15-minute call this week? Happy to walk you through it, no obligation.",
    "",
    `— ${sender}`,
  );
  return { subject, body: lines.join("\n") };
}
