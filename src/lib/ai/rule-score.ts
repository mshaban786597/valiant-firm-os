import {
  leadScoreInputSchema,
  type LeadScoreOutput,
} from "@/lib/schemas/lead-score";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function priorityFromScore(score: number): LeadScoreOutput["priority_status"] {
  if (score >= 80) return "Priority Target";
  if (score >= 65) return "Outreach Queue";
  if (score >= 40) return "Warm Manual Review";
  return "Archive / Recheck Later";
}

export function ruleBasedLeadScore(raw: unknown): LeadScoreOutput {
  const lead = leadScoreInputSchema.parse(raw);

  const tags = new Set((lead.weakness_tags ?? []).map((t) => t.toLowerCase()));

  const da = lead.domain_authority ?? 25;
  const seoWeakness = clamp(
    25 -
      (da >= 35 ? 8 : da >= 25 ? 4 : 0) -
      (tags.has("thin_content") || tags.has("thin_site") ? 6 : 0) -
      (tags.has("no_schema") || tags.has("weak_schema") ? 5 : 0) -
      (tags.has("dup_meta") || tags.has("cannibalization") ? 4 : 0) -
      (tags.has("content_decay") ? 3 : 0),
    0,
    25,
  );

  const gbpText = `${lead.gbp_status ?? ""}`.toLowerCase();
  const gbp = clamp(
    20 -
      (gbpText.includes("incomplete") ||
      gbpText.includes("missing") ||
      gbpText.includes("weak") ||
      gbpText.includes("duplicate")
        ? 10
        : gbpText.includes("strong") || gbpText.includes("optimized")
          ? 2
          : 6),
    0,
    20,
  );

  const reviews = lead.review_count ?? 0;
  const stars = lead.star_rating ?? 4.2;
  const reviewVelocity = clamp(
    reviews < 25 ? 16 : reviews < 80 ? 12 : reviews < 200 ? 8 : 5,
    0,
    20,
  );
  const reviewAdj = stars < 4.3 ? 4 : stars < 4.6 ? 2 : 0;
  const reviewScore = clamp(reviewVelocity + reviewAdj - (reviews === 0 ? 8 : 0), 0, 20);

  const ws = `${lead.website_status ?? ""}`.toLowerCase();
  const websiteQuality = clamp(
    20 -
      (ws.includes("slow") || ws.includes("lcp") || ws.includes("cwv") ? 8 : 0) -
      (ws.includes("thin") ? 6 : 0) -
      (ws.includes("single page") ? 7 : 0) -
      (!lead.website_url ? 6 : 0),
    0,
    20,
  );

  const businessSignals = clamp(
    15 -
      (!lead.phone ? 2 : 0) -
      (!lead.email ? 3 : 0) -
      (!lead.website_url ? 3 : 0),
    0,
    15,
  );

  const composite = clamp(
    seoWeakness + gbp + reviewScore + websiteQuality + businessSignals,
    0,
    100,
  );

  const weakness_tags = Array.from(
    new Set([
      ...(lead.weakness_tags ?? []),
      ...(da < 20 ? ["low_authority"] : []),
      ...(reviews < 40 ? ["review_gap"] : []),
    ]),
  );

  const niche = lead.niche;
  const city = lead.city;

  const recommended_offer =
    composite >= 75
      ? `${niche} growth sprint — Local SEO + GBP + CWV fixes (${city})`
      : composite >= 65
        ? `${niche} visibility rebuild — technical SEO + on-page + GBP hygiene`
        : `${niche} diagnostic — audit + 30-day remediation roadmap`;

  const outreach_angle =
    composite >= 75
      ? "Lead velocity leaks vs competitors in local SERPs"
      : composite >= 65
        ? "Operational fixes unlock near-term rankings without ad spend"
        : "Low-risk audit-first entry to validate ROI";

  const first_email_hook = `${lead.business_name} is leaving revenue on the table in ${city}: GBP + site signals suggest quick wins before peak season.`;

  return {
    composite_score: composite,
    seo_weakness_score: seoWeakness,
    gbp_score: gbp,
    review_velocity_score: reviewScore,
    website_quality_score: websiteQuality,
    business_signal_score: businessSignals,
    weakness_tags,
    recommended_offer,
    first_email_hook,
    outreach_angle,
    priority_status: priorityFromScore(composite),
    reasoning_summary: `Composite ${composite}/100 from deterministic rules (SEO weakness ${seoWeakness}/25, GBP ${gbp}/20, reviews ${reviewScore}/20, website ${websiteQuality}/20, business signals ${businessSignals}/15).`,
  };
}
