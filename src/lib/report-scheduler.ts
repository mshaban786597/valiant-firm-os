import type { Prisma, Report } from "@prisma/client";
import { REPORT_SUMMARY_SYSTEM } from "@/lib/ai/prompts";
import { aiReportSummaryJson } from "@/lib/ai/llm-json";
import { fallbackReportSummary } from "@/lib/ai/fallbacks";
import { logAiEvent } from "@/lib/ai/log";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import type { ReportSummaryOutput } from "@/lib/schemas/report-summary";

type ReportWithClient = Report & { client: { businessName: string } };

function toSummaryInput(report: ReportWithClient) {
  return {
    client_name: report.client.businessName,
    month: report.month,
    organic_sessions: report.organicSessions ?? undefined,
    organic_leads: report.organicLeads ?? undefined,
    keyword_growth: report.keywordGrowth ?? undefined,
    backlink_growth: report.backlinkGrowth ?? undefined,
    gbp_calls: report.gbpCalls ?? undefined,
    gbp_views: report.gbpViews ?? undefined,
    tasks_completed: report.tasksCompleted ?? undefined,
    issues_fixed: report.issuesFixed ?? undefined,
  };
}

async function computeSummary(input: ReturnType<typeof toSummaryInput>): Promise<{
  provider: "openai" | "anthropic" | "rules";
  output: ReportSummaryOutput;
}> {
  let provider: "openai" | "anthropic" | "rules" = "rules";
  let output = fallbackReportSummary(input);
  const ai = await aiReportSummaryJson(
    REPORT_SUMMARY_SYSTEM,
    JSON.stringify(input) +
      `\n\nReturn JSON keys: executive_summary, wins_this_month (array), issues_fixed (array), ranking_movements, traffic_summary, gbp_summary, next_30_days (array), client_friendly_explanation.`,
  );
  if (ai) {
    provider = ai.provider;
    output = ai.value;
  }
  return { provider, output };
}

export interface GeneratedReport {
  reportId: string;
  clientName: string;
  provider: string;
}

/**
 * Generate AI summaries for reports that are "due": still in Draft with no
 * summary written yet. Idempotent — a report already summarized is skipped, so
 * the cron can run repeatedly. Scopes to one org when `organizationId` given.
 */
export async function generateDueReports(
  organizationId?: string,
  limit = 25,
): Promise<GeneratedReport[]> {
  const due = await prisma.report.findMany({
    where: {
      status: "Draft",
      reportSummary: null,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { client: { select: { businessName: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const generated: GeneratedReport[] = [];
  for (const report of due) {
    const input = toSummaryInput(report);
    const { provider, output } = await computeSummary(input);

    await prisma.report.update({
      where: { id: report.id },
      data: {
        reportSummary: output.executive_summary,
        nextMonthPlan: output.next_30_days.join("\n"),
        aiSummary: output as unknown as Prisma.InputJsonValue,
      },
    });

    await logAiEvent({
      organizationId: report.organizationId,
      agentName: "Scheduled Reporting Agent",
      inputType: "report_metrics",
      outputType: "report_summary_json",
      status: provider === "rules" ? "fallback" : "success",
      relatedRecord: report.id,
      payloadIn: input,
      payloadOut: output,
      costEstimate: provider === "rules" ? 0 : 0.14,
      tokensUsed: provider === "rules" ? 0 : 1600,
    });

    generated.push({
      reportId: report.id,
      clientName: report.client.businessName,
      provider,
    });
  }

  if (generated.length > 0) {
    await telemetry.info({
      source: "cron.generate-reports",
      message: `Generated ${generated.length} report summaries`,
      organizationId: organizationId ?? null,
      meta: { count: generated.length },
    });
  }

  return generated;
}
