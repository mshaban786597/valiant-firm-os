import { NextResponse } from "next/server";
import { REPORT_SUMMARY_SYSTEM } from "@/lib/ai/prompts";
import { aiReportSummaryJson } from "@/lib/ai/llm-json";
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
      `\n\nReturn JSON keys: executive_summary, wins_this_month (array), issues_fixed (array), ranking_movements, traffic_summary, gbp_summary, next_30_days (array), client_friendly_explanation.`,
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
    costEstimate: provider === "rules" ? 0 : 0.14,
    tokensUsed: provider === "rules" ? 0 : 1600,
  });

  return NextResponse.json({ provider, summary: output });
}
