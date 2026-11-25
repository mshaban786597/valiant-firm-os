import { NextResponse } from "next/server";
import { HEALTH_RISK_SYSTEM } from "@/lib/ai/prompts";
import { aiHealthRiskJson } from "@/lib/ai/llm-json";
import { HEALTH_RISK_OUTPUT_RULES } from "@/lib/ai/output-rules";
import { ruleHealthRiskFromSignals } from "@/lib/ai/rule-health";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { healthRiskRequestSchema } from "@/lib/schemas/inputs";
import { prisma } from "@/lib/prisma";
import { ClientStatus, TaskPriority, TaskStatus } from "@prisma/client";

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = healthRiskRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let provider: "anthropic" | "rules" = "rules";
  let output = ruleHealthRiskFromSignals(
    parsed.data.client_name,
    parsed.data.signals,
  );

  const ai = await aiHealthRiskJson(
    HEALTH_RISK_SYSTEM,
    JSON.stringify(parsed.data) +
      `\n\n${HEALTH_RISK_OUTPUT_RULES}`,
  );
  if (ai) {
    provider = ai.provider;
    output = ai.value;
  }

  const client = await prisma.client.findFirst({
    where: {
      organizationId: org.organizationId,
      businessName: parsed.data.client_name,
    },
  });

  if (client) {
    await prisma.healthScoreSnapshot.create({
      data: {
        organizationId: org.organizationId,
        clientId: client.id,
        compositeScore: output.composite_score,
        rankTrendPts: output.rank_trend_pts,
        responsePts: responsePtsSafe(output.response_pts),
        paymentPts: output.payment_pts,
        engagementPts: output.engagement_pts,
        npsPts: output.nps_pts,
        goalPts: output.goal_pts,
        band: output.band,
        retentionNotes: output.retention_summary,
        checkInEmail: output.check_in_email,
      },
    });

    await prisma.client.update({
      where: { id: client.id },
      data: {
        healthScore: output.composite_score,
        status:
          output.composite_score < 60 ? ClientStatus.AtRisk : client.status,
      },
    });

    if (output.composite_score < 60) {
      await prisma.founderAlert.create({
        data: {
          organizationId: org.organizationId,
          clientId: client.id,
          title: `Retention signal: ${client.businessName}`,
          body: output.retention_summary,
          severity: output.band === "Red" ? "critical" : "high",
        },
      });

      await prisma.task.create({
        data: {
          organizationId: org.organizationId,
          clientId: client.id,
          title: "Retention rescue sprint",
          description: output.retention_summary,
          serviceType: "Retention",
          owner: "Founder",
          priority: TaskPriority.High,
          status: TaskStatus.Backlog,
        },
      });
    }
  }

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Client Health Agent",
    inputType: "health_signals",
    outputType: "health_json",
    status: provider === "rules" ? "fallback" : "success",
    payloadIn: parsed.data,
    payloadOut: output,
    relatedRecord: client?.id,
    costEstimate: ai ? ai.costEstimate : 0,
    tokensUsed: ai ? ai.tokensUsed : 0,
  });

  return NextResponse.json({ provider, health: output });
}

function responsePtsSafe(n: number) {
  return Number.isFinite(n) ? n : 0;
}
