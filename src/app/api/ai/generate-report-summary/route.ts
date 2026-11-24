import { NextResponse } from "next/server";
import { REPORT_SUMMARY_SYSTEM } from "@/lib/ai/prompts";
import { aiReportSummaryJson } from "@/lib/ai/llm-json";
import { REPORT_SUMMARY_OUTPUT_RULES } from "@/lib/ai/output-rules";
import { fallbackReportSummary } from "@/lib/ai/fallbacks";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { reportSummaryRequestSchema } from "@/lib/schemas/inputs";

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = reportSummaryRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let provider: "openai" | "anthropic" | "rules" = "rules";
  let output = fallbackReportSummary(parsed.data);

  const ai = await aiReportSummaryJson(
    REPORT_SUMMARY_SYSTEM,
    JSON.stringify(parsed.data) +
      `\n\n${REPORT_SUMMARY_OUTPUT_RULES}`,
  );
  if (ai) {
    provider = ai.provider;
    output = ai.value;
  }

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Monthly Reporting Agent",
    inputType: "report_metrics",
    outputType: "report_summary_json",
    status: provider === "rules" ? "fallback" : "success",
    payloadIn: parsed.data,
    payloadOut: output,
    costEstimate: ai ? ai.costEstimate : 0,
    tokensUsed: ai ? ai.tokensUsed : 0,
  });

  return NextResponse.json({ provider, summary: output });
}
