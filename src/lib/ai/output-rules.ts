/**
 * What each AI reply must look like, written to match the schema the reply is
 * checked against (src/lib/schemas/*). A reply that breaks these is discarded
 * and the rule-based result is used instead, so the type of every key is
 * spelled out: "string" means one plain string, never an object or a list.
 */

const NO_INVENTION =
  "Use only the facts given above. Do not invent numbers, results, rankings, prices, audits or checks; where something is not known, say it is not known.";

export const OUTREACH_OUTPUT_RULES = `Return one JSON object with exactly these keys:
- subject_lines: array of strings
- email_1, email_2, email_3, email_4: each one plain string
- linkedin_message: string
- sms_message: string
- cta: string
- personalization_notes: string
${NO_INVENTION}`;

export const PROPOSAL_OUTPUT_RULES = `Return one JSON object with exactly these keys:
- executive_summary: string
- current_problem: string
- opportunity: string
- recommended_solution: string
- scope_of_work: array of strings
- plan_30_day: array of strings
- plan_60_day: array of strings
- plan_90_day: array of strings
- pricing: string
- expected_outcomes: array of strings
- next_steps: array of strings
${NO_INVENTION}`;

export const CONTENT_BRIEF_OUTPUT_RULES = `Return one JSON object with exactly these keys:
- search_intent: string
- target_keyword: string
- secondary_keywords: array of strings
- entity_map: array of strings (one entity per item)
- heading_structure: array of strings (one heading per item, written like "H2: Heading text")
- faq_questions: array of strings (the question only)
- internal_linking_recommendations: array of strings
- schema_recommendation: string
- eeat_notes: string
- local_seo_notes: string
- aeo_geo_notes: string
Every array item is a plain string, never an object. Every other value is one plain string, never an object or a list.
${NO_INVENTION}`;

export const REPORT_SUMMARY_OUTPUT_RULES = `Return one JSON object with exactly these keys:
- executive_summary: string
- wins_this_month: array of strings
- issues_fixed: array of strings
- ranking_movements: string
- traffic_summary: string
- gbp_summary: string
- next_30_days: array of strings
- client_friendly_explanation: string
A metric that is missing above was not measured: say so instead of estimating it, and leave an array empty when there is nothing real to list.
${NO_INVENTION}`;

export const HEALTH_RISK_OUTPUT_RULES = `The six signals are already points out of their maximums: rank_trend /25, response_time /15, payment_history /20, report_engagement /10, nps /15, goal_progress /15.
Return one JSON object with exactly these keys:
- band: "Green" when composite_score is 80 or more, "Yellow" from 60 to 79, "Orange" from 40 to 59, "Red" below 40
- composite_score: number from 0 to 100, the sum of the six signals
- rank_trend_pts: number (the rank_trend signal)
- response_pts: number (the response_time signal)
- payment_pts: number (the payment_history signal)
- engagement_pts: number (the report_engagement signal)
- nps_pts: number (the nps signal)
- goal_pts: number (the goal_progress signal)
- retention_summary: string
- check_in_email: one plain string holding the whole email (subject line first), never an object
${NO_INVENTION}`;
