import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getIntegration } from "@/lib/integrations/catalog";
import { hasLiveTest, testIntegration } from "@/lib/integrations/catalog-ping";

export const runtime = "nodejs";

const schema = z.object({ id: z.string().min(1).max(60) });

/**
 * Run a live, read-only connection test for one integration and persist the
 * result. "Live verified" is only recorded when a real provider call succeeded.
 */
export async function POST(req: Request) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const tool = getIntegration(parsed.data.id);
  if (!tool) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });

  const result = await testIntegration(tool);
  const now = new Date();
  // A real provider round-trip happened only when the tool has a ping and it passed.
  const liveVerified = result.ok && hasLiveTest(tool.id);
  await prisma.integrationVerification.upsert({
    where: { organizationId_integrationId: { organizationId: org.organizationId, integrationId: tool.id } },
    create: {
      organizationId: org.organizationId,
      integrationId: tool.id,
      lastTestAt: now,
      lastTestOk: result.ok,
      lastTestDetail: result.detail,
      lastLiveVerifiedAt: liveVerified ? now : null,
    },
    update: {
      lastTestAt: now,
      lastTestOk: result.ok,
      lastTestDetail: result.detail,
      ...(liveVerified ? { lastLiveVerifiedAt: now } : {}),
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "integration.test",
    entity: "Integration",
    entityId: tool.id,
    meta: { ok: result.ok, liveVerified },
  });
  return NextResponse.json({ id: tool.id, ...result, liveVerified });
}
