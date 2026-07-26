import { LEAD_SCORE_SYSTEM } from "@/lib/ai/prompts";
import { ruleBasedLeadScore } from "@/lib/ai/rule-score";
import { aiLeadScoreJson } from "@/lib/ai/llm-json";
import type { LeadScoreInput } from "@/lib/mappers/lead";
import type { LeadScoreOutput } from "@/lib/schemas/lead-score";

export async function computeLeadScore(input: LeadScoreInput): Promise<{
  provider: "openai" | "anthropic" | "rules";
  score: LeadScoreOutput;
}> {
  const userPayload = `Lead JSON:\n${JSON.stringify(input)}\n\nReturn JSON with keys: composite_score, seo_weakness_score, gbp_score, review_velocity_score, website_quality_score, business_signal_score, weakness_tags (array), recommended_offer, first_email_hook, outreach_angle, priority_status (Priority Target|Outreach Queue|Warm Manual Review|Archive / Recheck Later), reasoning_summary.`;

  let provider: "openai" | "anthropic" | "rules" = "rules";
  let score = ruleBasedLeadScore(input);

  const ai = await aiLeadScoreJson(LEAD_SCORE_SYSTEM, userPayload);
  if (ai) {
    provider = ai.provider;
    score = ai.value;
  }

  return { provider, score };
}
