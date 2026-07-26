import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { getProvider, verifyWebhook } from "@/lib/integrations/registry";
import { runTrigger } from "@/lib/automations/engine";

/**
 * Dynamic inbound webhook endpoint for third-party providers (see
 * src/lib/integrations/registry.ts). Resolves the target organization from
 * `?org=<slug>` or a top-level `organizationSlug` in the body, verifies the
 * provider signature, logs the event, and fires `webhook_received` workflows.
 */
export async function POST(
  req: Request,
  { params }: { params: { provider: string } },
) {
  const provider = getProvider(params.provider);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const raw = await req.text();
  const verification = verifyWebhook(provider, raw, req.headers);
  if (!verification.ok) {
    await telemetry.warn({
      source: `webhook.${provider.id}`,
      message: `Rejected webhook: ${verification.reason}`,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const { searchParams } = new URL(req.url);
  const orgSlug =
    searchParams.get("org") ??
    (typeof payload.organizationSlug === "string" ? payload.organizationSlug : null);
  if (!orgSlug) {
    return NextResponse.json(
      { error: "Missing organization (pass ?org=<slug>)" },
      { status: 400 },
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  }

  await prisma.automationLog.create({
    data: {
      organizationId: organization.id,
      name: `${provider.label} webhook`,
      trigger: "webhook_received",
      status: "success",
      lastRun: new Date(),
      successCount: 1,
      connectedTools: [provider.id],
    },
  });

  const runs = await runTrigger("webhook_received", {
    organizationId: organization.id,
    payload: { provider: provider.id, verified: verification.verified, event: payload },
  }).catch(() => []);

  await telemetry.info({
    source: `webhook.${provider.id}`,
    message: `Inbound ${provider.label} webhook processed`,
    organizationId: organization.id,
    meta: { verified: verification.verified, workflowsRun: runs.length },
  });

  return NextResponse.json({
    ok: true,
    provider: provider.id,
    verified: verification.verified,
    workflowsRun: runs.length,
  });
}
