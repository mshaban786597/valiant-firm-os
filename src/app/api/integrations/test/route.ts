import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getIntegration } from "@/lib/integrations/catalog";
import { hasLiveTest, testIntegration } from "@/lib/integrations/catalog-ping";
import { UBERSUGGEST, testUbersuggest } from "@/lib/integrations/ubersuggest";
import { GOOGLE_ADS_ID, readGoogleAds } from "@/lib/integrations/google-ads-sync";
import { testMailbox } from "@/lib/outreach/mailbox";

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

  let result: { ok: boolean; detail: string };
  let realCall = hasLiveTest(tool.id);
  if (tool.id === UBERSUGGEST) {
    // Signed-in tool: the test is a real call with the stored sign-in.
    const r = await testUbersuggest(org.organizationId);
    result = r.ok ? { ok: true, detail: r.data.summary } : { ok: false, detail: r.detail };
    realCall = true;
  } else if (tool.id === GOOGLE_ADS_ID) {
    // A real read of every Ads account the service account can reach. Saves nothing.
    const r = await readGoogleAds();
    result = { ok: r.ok, detail: r.message };
    realCall = true;
  } else if (tool.id === "outreach-mailbox") {
    // A real sign-in to the mailbox. Sends nothing.
    result = await testMailbox();
    realCall = true;
  } else {
    result = await testIntegration(tool);
  }
  const now = new Date();
  // A real provider round-trip happened only when a live call was made and it passed.
  const liveVerified = result.ok && realCall;
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
