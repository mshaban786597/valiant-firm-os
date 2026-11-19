import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Delivery events from the email provider (Resend, signed with Svix):
 * delivered, opened, clicked, bounced, complained.
 *
 * An "open" is recorded when the provider's tracking image loads. Some mail
 * apps load images automatically and some block them, so opens are a hint,
 * not proof that a person read the email.
 */
export type EmailEventType = "delivered" | "opened" | "clicked" | "bounced" | "complained";

const EVENT_MAP: Record<string, EmailEventType> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export function eventTypeOf(type: unknown): EmailEventType | null {
  return typeof type === "string" ? (EVENT_MAP[type] ?? null) : null;
}

/**
 * Verify a Svix-signed webhook. `secret` is the provider's signing secret
 * ("whsec_<base64>"). Rejects anything older than five minutes.
 */
export function verifySvixSignature(input: {
  secret: string | undefined;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: Date;
}): boolean {
  const { secret, id, timestamp, signature, body } = input;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSec - ts) > 300) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  // Header holds one or more space-separated "v1,<base64>" entries.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    try {
      const got = Buffer.from(value, "base64");
      return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    } catch {
      return false;
    }
  });
}

export interface ApplyEventResult {
  matched: boolean;
  type: EmailEventType;
  canceledFollowUps?: number;
  suppressed?: boolean;
}

/** Apply one provider event to the send it belongs to (matched by the provider's message id). */
export async function applyEmailEvent(input: {
  type: EmailEventType;
  providerMessageId: string;
  at?: Date;
}): Promise<ApplyEventResult> {
  const at = input.at ?? new Date();
  const send = await prisma.outreachSend.findFirst({
    where: { providerMessageId: input.providerMessageId },
    select: { id: true, organizationId: true, leadId: true, toEmail: true, deliveredAt: true, openedAt: true, clickedAt: true },
  });
  if (!send) return { matched: false, type: input.type };

  if (input.type === "delivered") {
    if (!send.deliveredAt) await prisma.outreachSend.update({ where: { id: send.id }, data: { deliveredAt: at } });
    return { matched: true, type: input.type };
  }
  if (input.type === "opened") {
    await prisma.outreachSend.update({
      where: { id: send.id },
      data: { openedAt: send.openedAt ?? at, openCount: { increment: 1 }, deliveredAt: send.deliveredAt ?? at },
    });
    return { matched: true, type: input.type };
  }
  if (input.type === "clicked") {
    await prisma.outreachSend.update({
      where: { id: send.id },
      data: { clickedAt: send.clickedAt ?? at, openedAt: send.openedAt ?? at, deliveredAt: send.deliveredAt ?? at },
    });
    return { matched: true, type: input.type };
  }

  // Bounce or spam complaint: never email this address again.
  const reason = input.type === "bounced" ? "bounce" : "unsubscribe";
  const email = send.toEmail.toLowerCase();
  await prisma.suppression.upsert({
    where: { organizationId_email: { organizationId: send.organizationId, email } },
    create: { organizationId: send.organizationId, email, reason, source: `provider:${input.type}` },
    update: {},
  });
  const canceled = await prisma.outreachSend.updateMany({
    where: { leadId: send.leadId, status: "scheduled" },
    data: { status: "canceled", cancelReason: input.type === "bounced" ? "Email bounced" : "Marked as spam by the recipient" },
  });
  return { matched: true, type: input.type, canceledFollowUps: canceled.count, suppressed: true };
}
