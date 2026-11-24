import { NextResponse } from "next/server";
import { CONTENT_BRIEF_SYSTEM } from "@/lib/ai/prompts";
import { aiContentBriefJson } from "@/lib/ai/llm-json";
import { CONTENT_BRIEF_OUTPUT_RULES } from "@/lib/ai/output-rules";
import { fallbackContentBrief } from "@/lib/ai/fallbacks";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { contentBriefRequestSchema } from "@/lib/schemas/inputs";

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = contentBriefRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let provider: "openai" | "anthropic" | "rules" = "rules";
  let output = fallbackContentBrief(parsed.data);

  const ai = await aiContentBriefJson(
    CONTENT_BRIEF_SYSTEM,
    JSON.stringify(parsed.data) +
      `\n\n${CONTENT_BRIEF_OUTPUT_RULES}`,
  );
  if (ai) {
    provider = ai.provider;
    output = ai.value;
  }

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Content Brief Agent",
    inputType: "brief_inputs",
    outputType: "brief_json",
    status: provider === "rules" ? "fallback" : "success",
    payloadIn: parsed.data,
    payloadOut: output,
    costEstimate: ai ? ai.costEstimate : 0,
    tokensUsed: ai ? ai.tokensUsed : 0,
  });

  return NextResponse.json({ provider, brief: output });
}
