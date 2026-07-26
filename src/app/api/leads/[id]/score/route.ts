import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { computeLeadScore } from "@/lib/ai/compute-lead-score";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { mapLeadToScoreInput } from "@/lib/mappers/lead";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = mapLeadToScoreInput(lead);
  const { provider, score } = await computeLeadScore(input);

  await prisma.leadScore.create({
    data: {
      organizationId: org.organizationId,
      leadId: lead.id,
      compositeScore: score.composite_score,
      seoWeaknessScore: score.seo_weakness_score,
      gbpScore: score.gbp_score,
      reviewVelocityScore: score.review_velocity_score,
      websiteQualityScore: score.website_quality_score,
      businessSignalScore: score.business_signal_score,
      weaknessTags: score.weakness_tags,
      recommendedOffer: score.recommended_offer,
      firstEmailHook: score.first_email_hook,
      outreachAngle: score.outreach_angle,
      priorityStatus: score.priority_status,
      reasoningSummary: score.reasoning_summary,
    },
  });

  const preOutreach = new Set<LeadStatus>([
    LeadStatus.Raw,
    LeadStatus.Qualified,
  ]);

  const nextStatus =
    score.composite_score >= 65 && preOutreach.has(lead.status)
      ? LeadStatus.OutreachQueue
      : lead.status;

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      leadScore: score.composite_score,
      weaknessTags: score.weakness_tags,
      recommendedOffer: score.recommended_offer,
      outreachAngle: score.outreach_angle,
      status: nextStatus,
    },
  });

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Lead Scoring Agent",
    inputType: "lead_record",
    outputType: "score_json",
    status: provider === "rules" ? "fallback" : "success",
    relatedRecord: lead.id,
    payloadIn: input,
    payloadOut: score,
    tokensUsed: provider === "rules" ? 0 : 900,
    costEstimate: provider === "rules" ? 0 : 0.06,
  });

  return NextResponse.json({ provider, score });
}
