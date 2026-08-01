import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhooks";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";

/**
 * Generic automation ingress for Make/n8n.
 *
 * Expected JSON (example):
 * {
 *   "organizationSlug": "valiant-firm",
 *   "automationName": "Monthly SEO Data Pull",
 *   "status": "success",
 *   "connectedTools": ["GA4","GSC"],
 *   "errorMessage": null
 * }
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature");

  // Fail-closed: require a verified signature. Only accept unverified posts
  // when the explicit dev escape hatch ALLOW_UNVERIFIED_WEBHOOKS=true is set.
  if (process.env.WEBHOOK_SECRET) {
    const ok = verifyWebhookSignature(raw, signature);
    if (!ok) {
      await telemetry.warn({
        source: "webhook.automation",
        message: "Rejected webhook: invalid HMAC signature",
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.ALLOW_UNVERIFIED_WEBHOOKS !== "true") {
    await telemetry.warn({
      source: "webhook.automation",
      message: "Rejected webhook: WEBHOOK_SECRET not configured (fail-closed)",
    });
    return NextResponse.json(
      { error: "Webhook verification not configured" },
      { status: 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgSlug = typeof payload.organizationSlug === "string"
    ? payload.organizationSlug
    : "valiant-firm";

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  }

  const name =
    typeof payload.automationName === "string"
      ? payload.automationName
      : "Inbound Automation";

  const status =
    typeof payload.status === "string" ? payload.status : "received";

  const connectedTools = Array.isArray(payload.connectedTools)
    ? (payload.connectedTools.filter((t) => typeof t === "string") as string[])
    : [];

  const errorMessage =
    typeof payload.errorMessage === "string" ? payload.errorMessage : null;

  const row = await prisma.automationLog.create({
    data: {
      organizationId: organization.id,
      name,
      trigger: "external_webhook",
      status,
      lastRun: new Date(),
      successCount: status === "success" ? 1 : 0,
      failureCount: status === "success" ? 0 : 1,
      errorMessage: errorMessage ?? undefined,
      connectedTools,
    },
  });

  await telemetry[status === "success" ? "info" : "error"]({
    source: "webhook.automation",
    message: `Automation "${name}" ingested with status=${status}`,
    organizationId: organization.id,
    meta: { automationId: row.id, connectedTools, errorMessage },
  });

  return NextResponse.json({ ok: true, automation_id: row.id });
}
