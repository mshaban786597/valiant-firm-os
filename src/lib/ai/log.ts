import { prisma } from "@/lib/prisma";

export async function logAiEvent(input: {
  organizationId: string;
  agentName: string;
  inputType: string;
  outputType: string;
  status: string;
  tokensUsed?: number;
  costEstimate?: number;
  relatedRecord?: string | null;
  payloadIn?: unknown;
  payloadOut?: unknown;
}) {
  await prisma.aiLog.create({
    data: {
      organizationId: input.organizationId,
      agentName: input.agentName,
      inputType: input.inputType,
      outputType: input.outputType,
      status: input.status,
      tokensUsed: input.tokensUsed,
      costEstimate: input.costEstimate,
      relatedRecord: input.relatedRecord ?? undefined,
      payloadIn: input.payloadIn ?? undefined,
      payloadOut: input.payloadOut ?? undefined,
    },
  });
}
