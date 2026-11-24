import { LEAD_SCORE_SYSTEM } from "@/lib/ai/prompts";
import { ruleBasedLeadScore } from "@/lib/ai/rule-score";
import { aiLeadScoreJson } from "@/lib/ai/llm-json";
import type { LeadScoreInput } from "@/lib/mappers/lead";
import type { LeadScoreOutput } from "@/lib/schemas/lead-score";

/**
 * What the reply must look like. The point limits are the ones the reply is
 * checked against (leadScoreOutputSchema): a reply outside them is discarded.
 */
export const LEAD_SCORE_OUTPUT_RULES = `Return one JSON object with exactly these keys:
- seo_weakness_score: number from 0 to 25
- gbp_score: number from 0 to 20
- review_velocity_score: number from 0 to 20
- website_quality_score: number from 0 to 20
- business_signal_score: number from 0 to 15
- composite_score: number from 0 to 100, the sum of the five scores above
- weakness_tags: array of short strings
- recommended_offer: string
- first_email_hook: string
- outreach_angle: string
- priority_status: one of "Priority Target", "Outreach Queue", "Warm Manual Review", "Archive / Recheck Later"
- reasoning_summary: string
A higher score means a stronger sales opportunity. A null field in the lead means the fact is unknown: score it cautiously and say so in reasoning_summary. Use only facts present in the lead JSON; do not claim an audit, a check or a ranking that is not in it.`;

export async function computeLeadScore(input: LeadScoreInput): Promise<{
  provider: "openai" | "anthropic" | "rules";
  score: LeadScoreOutput;
  /** Real figures from the provider; 0 when the rules produced the score. */
  tokensUsed?: number;
  costEstimate?: number;
}> {
  const userPayload = `Lead JSON:\n${JSON.stringify(input)}\n\n${LEAD_SCORE_OUTPUT_RULES}`;

  let provider: "openai" | "anthropic" | "rules" = "rules";
  let score = ruleBasedLeadScore(input);

  const ai = await aiLeadScoreJson(LEAD_SCORE_SYSTEM, userPayload);
  if (ai) {
    provider = ai.provider;
    score = ai.value;
  }

  return { provider, score, tokensUsed: ai ? ai.tokensUsed : 0, costEstimate: ai ? ai.costEstimate : 0 };
}
