import { leadScoreOutputSchema, type LeadScoreOutput } from "@/lib/schemas/lead-score";
import type { OutreachOutput } from "@/lib/schemas/outreach";
import { outreachOutputSchema } from "@/lib/schemas/outreach";
import type { ProposalOutput } from "@/lib/schemas/proposal";
import { proposalOutputSchema } from "@/lib/schemas/proposal";
import type { ContentBriefOutput } from "@/lib/schemas/content-brief";
import { contentBriefOutputSchema } from "@/lib/schemas/content-brief";
import type { ReportSummaryOutput } from "@/lib/schemas/report-summary";
import { reportSummaryOutputSchema } from "@/lib/schemas/report-summary";
import type { HealthRiskOutput } from "@/lib/schemas/health-risk";
import { healthRiskOutputSchema } from "@/lib/schemas/health-risk";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claudeCostUsd, claudeText, extractJson, type ClaudeEffort } from "@/lib/ai/claude";

async function openAiJson(system: string, user: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    // No price table for this provider: tokens are real, cost is left unknown.
    return { json: JSON.parse(content) as unknown, tokensUsed: data.usage?.total_tokens, costEstimate: undefined };
  } catch {
    return null;
  }
}

async function anthropicJson(system: string, user: string, effort: ClaudeEffort, schema: z.ZodType) {
  // The reply is constrained to the same schema it is checked against below.
  const jsonSchema = zodOutputFormat(schema).schema as Record<string, unknown>;
  const reply = await claudeText({ system, user, effort, jsonSchema });
  if (!reply || !reply.ok) return null;
  const json = extractJson(reply.text);
  if (json === null) return null;
  return {
    json,
    tokensUsed: reply.inputTokens + reply.outputTokens,
    costEstimate: claudeCostUsd(reply.model, reply.inputTokens, reply.outputTokens),
  };
}

async function llmJson(system: string, user: string, schema: z.ZodType, effort: ClaudeEffort = "medium") {
  const openai = await openAiJson(system, user);
  if (openai) return { provider: "openai" as const, ...openai };
  const claude = await anthropicJson(system, user, effort, schema);
  if (claude) return { provider: "anthropic" as const, ...claude };
  return null;
}

export async function aiLeadScoreJson(
  system: string,
  user: string,
): Promise<{ provider: "openai" | "anthropic"; value: LeadScoreOutput; tokensUsed?: number; costEstimate?: number } | null> {
  const got = await llmJson(system, user, leadScoreOutputSchema, "low");
  if (!got) return null;
  const parsed = leadScoreOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data, tokensUsed: got.tokensUsed, costEstimate: got.costEstimate };
}

export async function aiOutreachJson(system: string, user: string) {
  const got = await llmJson(system, user, outreachOutputSchema);
  if (!got) return null;
  const parsed = outreachOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as OutreachOutput, tokensUsed: got.tokensUsed, costEstimate: got.costEstimate };
}

export async function aiProposalJson(system: string, user: string) {
  const got = await llmJson(system, user, proposalOutputSchema);
  if (!got) return null;
  const parsed = proposalOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as ProposalOutput, tokensUsed: got.tokensUsed, costEstimate: got.costEstimate };
}

export async function aiContentBriefJson(system: string, user: string) {
  const got = await llmJson(system, user, contentBriefOutputSchema);
  if (!got) return null;
  const parsed = contentBriefOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as ContentBriefOutput, tokensUsed: got.tokensUsed, costEstimate: got.costEstimate };
}

export async function aiReportSummaryJson(system: string, user: string) {
  const got = await llmJson(system, user, reportSummaryOutputSchema);
  if (!got) return null;
  const parsed = reportSummaryOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as ReportSummaryOutput, tokensUsed: got.tokensUsed, costEstimate: got.costEstimate };
}

export async function aiHealthRiskJson(system: string, user: string) {
  const got = await llmJson(system, user, healthRiskOutputSchema, "low");
  if (!got) return null;
  const parsed = healthRiskOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as HealthRiskOutput, tokensUsed: got.tokensUsed, costEstimate: got.costEstimate };
}
