import { NextResponse } from "next/server";
import { authSecret } from "@/lib/auth-secret";
import { readUnsubscribeToken } from "@/lib/email/campaign";
import { unsubscribeRecipient } from "@/lib/email/campaign-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unsubscribe one recipient. Public: the signed token in the link is the proof.
 * Only POST changes anything, so a mail scanner that merely opens the link
 * cannot unsubscribe someone. Mail apps' one-click unsubscribe posts here too.
 */
export async function POST(req: Request) {
  let token = new URL(req.url).searchParams.get("token");
  if (!token) {
    const json = (await req.json().catch(() => null)) as { token?: unknown } | null;
    if (typeof json?.token === "string") token = json.token;
  }
  const recipientId = readUnsubscribeToken(token, authSecret());
  if (!recipientId) return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });

  const result = await unsubscribeRecipient(recipientId, "unsubscribe_link");
  if (!result.found) return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
  return NextResponse.json({ success: true });
}
