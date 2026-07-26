import type { LeadScoreInput } from "@/lib/mappers/lead";
import type { OutreachOutput } from "@/lib/schemas/outreach";
import type { ProposalOutput } from "@/lib/schemas/proposal";
import type { ContentBriefOutput } from "@/lib/schemas/content-brief";
import type { ReportSummaryOutput } from "@/lib/schemas/report-summary";

export function fallbackOutreach(lead: LeadScoreInput): OutreachOutput {
  const geo = `${lead.city}, ${lead.state}`;
  const hook = `${lead.business_name} likely has fast wins in ${geo}—especially GBP completeness vs competitors.`;
  return {
    subject_lines: [
      `Quick ${lead.niche.toLowerCase()} visibility idea for ${lead.city}`,
      `${lead.business_name}: local demand you're close to capturing`,
      `A sharper GBP + site angle for ${lead.business_name}`,
    ],
    email_1: `Hey — ${hook}\n\nI'm building a tight playbook for premium operators in ${lead.niche.toLowerCase()} around ${geo}. If you're open, I'll send a 3-bullet diagnostic—no fluff.`,
    email_2: `Following up with a mini-audit snapshot:\n- GBP services/categories alignment\n- On-page gaps vs top 3 competitors\n- One technical fix that moves CTR fast\n\nWant me to drop it here?`,
    email_3: `Proof angle: we've helped similar ${lead.niche.toLowerCase()} operators lift qualified calls by tightening entity signals + CWV.\n\nIf helpful, I can share a comparable before/after in ${lead.city}.`,
    email_4: `Last note — if timing isn't right, totally fair.\n\nIf you want, I'll park a short Loom walking your SERP surface area so you have something actionable either way.`,
    linkedin_message: `Saw ${lead.business_name}—you're strong on fundamentals but there's a GBP + on-page wedge in ${geo} that typically unlocks incremental calls without raising ad spend. Open to a tight exchange?`,
    sms_message: `${lead.business_name} — quick question: open to a 3-bullet local visibility diagnostic for ${geo}?`,
    cta: `15-minute fit check · bring one competitor URL`,
    personalization_notes: `Lean on ${lead.niche} seasonality in ${geo}; reference GBP_status=${lead.gbp_status ?? "unknown"} and website_status=${lead.website_status ?? "unknown"}.`,
  };
}

export function fallbackProposal(input: {
  lead: LeadScoreInput;
  call_notes: string;
  business_goals: string;
  package: string;
  tier: string;
  weaknesses: string[];
  market_opportunity: string;
}): ProposalOutput {
  return {
    executive_summary: `${input.lead.business_name} is positioned to compound demand in ${input.lead.city}, ${input.lead.state} by tightening entity consistency, GBP completeness, and conversion-oriented landing architecture.`,
    current_problem: `Fragmented signals (${input.weaknesses.join(", ") || "technical + topical gaps"}) are causing leakage vs competitors despite commercial intent in-market.`,
    opportunity: input.market_opportunity,
    recommended_solution: `${input.package} (${input.tier}) focused on durable rankings, measurable leads, and operational clarity.`,
    scope_of_work: [
      "Technical baseline + crawl hygiene",
      "GBP optimization + review velocity workflow",
      "Service landing architecture + internal linking",
      "Measurement (GA4/GSC) + monthly exec narrative",
    ],
    plan_30_day: [
      "Baseline audit + priority fixes",
      "GBP overhaul + citation consistency pass",
      "Top-money pages optimized for intent match",
    ],
    plan_60_day: [
      "Content expansion mapped to entities + FAQs (AEO-ready)",
      "Authority acquisition within niche relevance constraints",
      "Conversion UX upgrades on core landing paths",
    ],
    plan_90_day: [
      "Expand topical coverage with QA governance",
      "Iterative testing on titles/meta + SERP features",
      "Retention dashboard + next-quarter roadmap",
    ],
    pricing: `${input.tier} · scoped as monthly execution with quarterly strategic resets (details finalized post-discovery).`,
    expected_outcomes: [
      "Higher impression share on money keywords",
      "Improved GBP actions (calls/directions)",
      "Cleaner analytics narrative for leadership decisions",
    ],
    next_steps: [
      "Confirm scope + tracking access",
      "Kickoff + assignment of owners",
      "30/60/90 deliverable calendar",
    ],
  };
}

export function fallbackContentBrief(input: {
  title: string;
  target_keyword: string;
  location?: string;
  service?: string;
  client_name?: string;
}): ContentBriefOutput {
  const geo = input.location ?? "";
  return {
    search_intent: `Commercial investigation for "${input.target_keyword}"${geo ? ` in ${geo}` : ""}.`,
    target_keyword: input.target_keyword,
    secondary_keywords: [
      `${input.target_keyword} near me`,
      `${input.service ?? "service"} ${geo}`.trim(),
    ].filter(Boolean),
    entity_map: [
      input.client_name ?? "Business entity",
      geo || "Primary market",
      input.service ?? "Core service line",
    ],
    heading_structure: [
      `H1: ${input.title}`,
      "H2: What this solves",
      "H2: Process / proof",
      "H2: FAQs",
      "H2: Service area / coverage",
    ],
    faq_questions: [
      `How fast can we improve rankings for "${input.target_keyword}"?`,
      "What metrics should we track weekly?",
      "How does GBP interact with site SEO here?",
    ],
    internal_linking_recommendations: [
      "Link to hub category page + sibling services",
      "Cross-link proof/case study supporting claims",
    ],
    schema_recommendation:
      "Use LocalBusiness + Service where applicable; add FAQPage if FAQs published on-page.",
    eeat_notes:
      "Add practitioner/brand proof, measurable outcomes, and transparent methodology.",
    local_seo_notes:
      "Embed entity+city pairs naturally; align GBP categories with page topics.",
    aeo_geo_notes:
      "FAQ passages should be citation-friendly: short declarative answers + consistent definitions.",
  };
}

export function fallbackReportSummary(input: {
  client_name: string;
  month: string;
  organic_sessions?: number;
  organic_leads?: number;
  keyword_growth?: number;
  backlink_growth?: number;
  gbp_calls?: number;
  gbp_views?: number;
  tasks_completed?: number;
  issues_fixed?: number;
}): ReportSummaryOutput {
  return {
    executive_summary: `${input.client_name} progressed operational SEO execution in ${input.month}, with measurable traction across visibility and conversion diagnostics.`,
    wins_this_month: [
      input.keyword_growth
        ? `Keyword footprint expanded +${input.keyword_growth} tracked terms`
        : "Keyword tracking stabilized core clusters",
      input.organic_sessions
        ? `Organic sessions reached ~${input.organic_sessions}`
        : "Organic sessions trended positively vs prior period",
      input.gbp_calls
        ? `GBP calls sustained healthy volume (~${input.gbp_calls})`
        : "GBP maintained actionable visibility",
    ],
    issues_fixed: [
      input.issues_fixed
        ? `Closed ${input.issues_fixed} prioritized technical/content issues`
        : "Resolved crawl/index friction on priority URLs",
      input.tasks_completed
        ? `Completed ${input.tasks_completed} delivery tasks`
        : "Delivery throughput improved week-over-week",
    ],
    ranking_movements:
      "Core local intent terms improved visibility; continued volatility on broader head terms—expected during optimization cycles.",
    traffic_summary: input.organic_sessions
      ? `Sessions ~${input.organic_sessions}; leads attributed ~${input.organic_leads ?? "N/A"}.`
      : "Traffic remains aligned with seasonal demand; focus next month on landing-page CVR.",
    gbp_summary: input.gbp_views
      ? `Views ~${input.gbp_views}; calls ~${input.gbp_calls ?? "tracked separately"}.`
      : "GBP signals stable; next steps emphasize photo refresh + Q&A governance.",
    next_30_days: [
      "Expand FAQ/AEO surfaces on top landing pages",
      "Tighten internal linking on hub→spoke architecture",
      "Publish monthly narrative + client-facing wins recap",
    ],
    client_friendly_explanation:
      "Think of this month as strengthening your website's 'credibility signals' so Google trusts you more for the services people already search—then we convert that visibility into calls and form fills.",
  };
}
