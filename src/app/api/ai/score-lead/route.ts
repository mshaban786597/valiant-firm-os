import { NextResponse } from "next/server";
import { computeLeadScore } from "@/lib/ai/compute-lead-score";
import { logAiEvent } from "@/lib/ai/log";
import { requireApiOrg } from "@/lib/api-org";
import { leadScoreInputSchema } from "@/lib/schemas/lead-score";

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = leadScoreInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { provider, score } = await computeLeadScore(parsed.data);

  await logAiEvent({
    organizationId: org.organizationId,
    agentName: "Lead Scoring Agent",
    inputType: "lead_json",
    outputType: "score_json",
    status: provider === "rules" ? "fallback" : "success",
    relatedRecord: undefined,
    payloadIn: parsed.data,
    payloadOut: score,
    costEstimate: provider === "rules" ? 0 : 0.06,
    tokensUsed: provider === "rules" ? 0 : 900,
  });

  return NextResponse.json({ provider, score });
}
