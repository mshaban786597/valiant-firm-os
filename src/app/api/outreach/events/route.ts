import { NextResponse } from "next/server";
import { telemetry } from "@/lib/telemetry";
import { applyEmailEvent, eventTypeOf, verifySvixSignature } from "@/lib/outreach/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email provider events (Resend): delivered, opened, clicked, bounced,
 * complained. Fail-closed: without RESEND_WEBHOOK_SECRET, or with a bad
 * signature, the request is rejected and nothing is recorded.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = verifySvixSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body: raw,
  });
  if (!ok) {
    await telemetry.warn({ source: "webhook.outreach-events", message: "Rejected email event: signature not valid" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const type = eventTypeOf(payload.type);
  const messageId = typeof payload.data?.email_id === "string" ? payload.data.email_id : null;
  if (!type || !messageId) return NextResponse.json({ success: true, ignored: true });

  const at = typeof payload.created_at === "string" && !Number.isNaN(Date.parse(payload.created_at)) ? new Date(payload.created_at) : new Date();
  const result = await applyEmailEvent({ type, providerMessageId: messageId, at });
  return NextResponse.json({ success: true, ...result });
}
