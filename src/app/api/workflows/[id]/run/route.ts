import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { runWorkflow } from "@/lib/automations/engine";

/**
 * Manually run a workflow once (for testing). Uses an empty trigger context, so
 * context-dependent actions (update_lead_status, create_task without a config
 * client) will report a controlled failure rather than doing anything unsafe.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requirePermission("automation.write");
  if (!org.ok) return org.response;

  const workflow = await prisma.workflow.findFirst({
    where: { id: params.id, organizationId: org.organizationId },
    select: { id: true, name: true, actions: true, organizationId: true },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await runWorkflow(workflow, {
    organizationId: org.organizationId,
    userId: org.userId,
    payload: { manual: true },
  });

  return NextResponse.json({ result });
}
