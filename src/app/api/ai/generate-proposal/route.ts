import { NextResponse } from "next/server";
import { PROPOSAL_SYSTEM } from "@/lib/ai/prompts";
import { aiProposalJson } from "@/lib/ai/llm-json";
import { PROPOSAL_OUTPUT_RULES } from "@/lib/ai/output-rules";
import { fallbackProposal } from "@/lib/ai/fallbacks";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { proposalRequestSchema } from "@/lib/schemas/inputs";

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = proposalRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let provider: "anthropic" | "rules" = "rules";
  let output = fallbackProposal({
    lead: parsed.data.lead,
    call_notes: parsed.data.call_notes,
    business_goals: parsed.data.business_goals,
    package: parsed.data.selected_service_package,
    tier: parsed.data.pricing_tier,
    weaknesses: parsed.data.weaknesses,
    market_opportunity: parsed.data.market_opportunity,
  });

  const ai = await aiProposalJson(
    PROPOSAL_SYSTEM,
    JSON.stringify(parsed.data) +
      `\n\n${PROPOSAL_OUTPUT_RULES}`,
  );
  if (ai) {
    provider = ai.provider;
    output = ai.value;
  }

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Proposal Agent",
    inputType: "proposal_inputs",
    outputType: "proposal_json",
    status: provider === "rules" ? "fallback" : "success",
    payloadIn: parsed.data,
    payloadOut: output,
    costEstimate: ai ? ai.costEstimate : 0,
    tokensUsed: ai ? ai.tokensUsed : 0,
  });

  return NextResponse.json({ provider, proposal: output });
}
