import { NextResponse } from "next/server";
import { OUTREACH_SYSTEM } from "@/lib/ai/prompts";
import { aiOutreachJson } from "@/lib/ai/llm-json";
import { fallbackOutreach } from "@/lib/ai/fallbacks";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { outreachRequestSchema } from "@/lib/schemas/inputs";

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = outreachRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let provider: "openai" | "anthropic" | "rules" = "rules";
  let output = fallbackOutreach(parsed.data.lead);

  const ai = await aiOutreachJson(
    OUTREACH_SYSTEM,
    `Lead:\n${JSON.stringify(parsed.data.lead)}\n\nReturn JSON keys: subject_lines (array), email_1..email_4, linkedin_message, sms_message, cta, personalization_notes.`,
  );
  if (ai) {
    provider = ai.provider;
    output = ai.value;
  }

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Outreach Agent",
    inputType: "lead_json",
    outputType: "outreach_bundle",
    status: provider === "rules" ? "fallback" : "success",
    payloadIn: parsed.data,
    payloadOut: output,
    costEstimate: provider === "rules" ? 0 : 0.12,
    tokensUsed: provider === "rules" ? 0 : 1400,
  });

  return NextResponse.json({ provider, output });
}
