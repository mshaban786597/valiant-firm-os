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
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

async function anthropicJson(system: string, user: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const slice = start >= 0 ? text.slice(start, end + 1) : text;
    return JSON.parse(slice) as unknown;
  } catch {
    return null;
  }
}

async function llmJson(system: string, user: string) {
  const openai = await openAiJson(system, user);
  if (openai) return { provider: "openai" as const, json: openai };
  const claude = await anthropicJson(system, user);
  if (claude) return { provider: "anthropic" as const, json: claude };
  return null;
}

export async function aiLeadScoreJson(
  system: string,
  user: string,
): Promise<{ provider: "openai" | "anthropic"; value: LeadScoreOutput } | null> {
  const got = await llmJson(system, user);
  if (!got) return null;
  const parsed = leadScoreOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data };
}

export async function aiOutreachJson(system: string, user: string) {
  const got = await llmJson(system, user);
  if (!got) return null;
  const parsed = outreachOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as OutreachOutput };
}

export async function aiProposalJson(system: string, user: string) {
  const got = await llmJson(system, user);
  if (!got) return null;
  const parsed = proposalOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as ProposalOutput };
}

export async function aiContentBriefJson(system: string, user: string) {
  const got = await llmJson(system, user);
  if (!got) return null;
  const parsed = contentBriefOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as ContentBriefOutput };
}

export async function aiReportSummaryJson(system: string, user: string) {
  const got = await llmJson(system, user);
  if (!got) return null;
  const parsed = reportSummaryOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as ReportSummaryOutput };
}

export async function aiHealthRiskJson(system: string, user: string) {
  const got = await llmJson(system, user);
  if (!got) return null;
  const parsed = healthRiskOutputSchema.safeParse(got.json);
  if (!parsed.success) return null;
  return { provider: got.provider, value: parsed.data as HealthRiskOutput };
}
