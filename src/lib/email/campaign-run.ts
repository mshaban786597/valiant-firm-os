import { prisma } from "@/lib/prisma";
import { authSecret } from "@/lib/auth-secret";
import { writeAuditLog } from "@/lib/audit";
import type { EmailEventType } from "@/lib/outreach/events";
import {
  CAMPAIGN_SPACING_MS,
  campaignRecipientAllowed,
  campaignRunBudget,
  campaignSender,
  countsFrom,
  decideRecipient,
  renderCampaignEmail,
  sendCampaignEmail,
  unsubscribeToken,
  type CampaignCounts,
  type CampaignReceipt,
  type CampaignSendRequest,
  type CampaignSender,
} from "@/lib/email/campaign";

type Env = Record<string, string | undefined>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A recipient claimed by a run that died is released after this long. */
const STUCK_MS = 10 * 60 * 1000;
/** Pending recipients looked at in one run. */
const SCAN = 200;

export interface CampaignRunResult {
  /** Why nothing was attempted, when sending is not possible. */
  off: string | null;
  sent: number;
  refused: number;
  skipped: number;
  /** The email service asked us to wait; the rest goes out on a later run. */
  waitingForService: boolean;
  heldDailyLimit: boolean;
  remaining: number;
  finished: boolean;
  counts: CampaignCounts;
}

export async function campaignCounts(campaignId: string): Promise<CampaignCounts> {
  const groups = await prisma.emailRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } });
  return countsFrom(groups.map((g) => ({ status: g.status, count: g._count._all })));
}

/**
 * Send the next batch of one campaign that is in "sending". Safe to run from
 * two places at once: each recipient is claimed with compare-and-set, and the
 * email service de-duplicates by recipient.
 */
export async function processCampaign(input: {
  organizationId: string;
  campaignId: string;
  env?: Env;
  now?: Date;
  send?: (req: CampaignSendRequest, sender: CampaignSender) => Promise<CampaignReceipt>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<CampaignRunResult | null> {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const send = input.send ?? sendCampaignEmail;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId, status: "sending" },
    select: { id: true, subject: true, body: true, updatedAt: true },
  });
  if (!campaign) return null;

  const result: CampaignRunResult = {
    off: null,
    sent: 0,
    refused: 0,
    skipped: 0,
    waitingForService: false,
    heldDailyLimit: false,
    remaining: 0,
    finished: false,
    counts: await campaignCounts(campaign.id),
  };

  const sender = campaignSender(env);
  const secret = authSecret();
  if (!sender.ready || !secret) {
    result.off = sender.ready ? "The app's signing secret is not set." : sender.reason;
    result.remaining = result.counts.pending;
    return result;
  }

  if (now.getTime() - campaign.updatedAt.getTime() > STUCK_MS) {
    await prisma.emailRecipient.updateMany({ where: { campaignId: campaign.id, status: "sending" }, data: { status: "pending" } });
  }
  await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { updatedAt: now } });

  const sentLast24h = await prisma.emailRecipient.count({
    where: { sentAt: { gte: new Date(now.getTime() - DAY_MS) }, campaign: { organizationId: input.organizationId } },
  });
  let budget = campaignRunBudget(sender.dailyLimit, sentLast24h);

  const pending = await prisma.emailRecipient.findMany({
    where: { campaignId: campaign.id, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: SCAN,
    select: { id: true, email: true },
  });
  const suppressed = new Set(
    (
      await prisma.suppression.findMany({
        where: { organizationId: input.organizationId, email: { in: pending.map((p) => p.email.trim().toLowerCase()) } },
        select: { email: true },
      })
    ).map((s) => s.email.toLowerCase()),
  );

  for (const r of pending) {
    const decision = decideRecipient({
      suppressed: suppressed.has(r.email.trim().toLowerCase()),
      allowed: campaignRecipientAllowed(r.email, env),
    });
    if (decision.action === "skip") {
      const done = await prisma.emailRecipient.updateMany({
        where: { id: r.id, status: "pending" },
        data: { status: "skipped", error: decision.reason },
      });
      result.skipped += done.count;
      continue;
    }
    if (budget <= 0) {
      result.heldDailyLimit = true;
      break;
    }
    const claim = await prisma.emailRecipient.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "sending" } });
    if (claim.count === 0) continue; // another run has it

    if (result.sent + result.refused > 0) await sleep(CAMPAIGN_SPACING_MS);
    const token = unsubscribeToken(r.id, secret);
    const unsubscribeUrl = `${sender.baseUrl}/unsubscribe/${token}`;
    const receipt = await send(
      {
        recipientId: r.id,
        to: r.email,
        subject: campaign.subject,
        email: renderCampaignEmail({ body: campaign.body, unsubscribeUrl, postalAddress: sender.postalAddress }),
        unsubscribeUrl,
        oneClickUrl: `${sender.baseUrl}/api/unsubscribe?token=${token}`,
      },
      sender,
    );

    if (receipt.status === "retry") {
      await prisma.emailRecipient.updateMany({ where: { id: r.id, status: "sending" }, data: { status: "pending" } });
      result.waitingForService = true;
      break;
    }
    if (receipt.status === "rejected") {
      await prisma.emailRecipient.update({ where: { id: r.id }, data: { status: "failed", error: receipt.error } });
      result.refused++;
      continue;
    }
    await prisma.emailRecipient.update({
      where: { id: r.id },
      data: { status: "sent", sentAt: now, providerMessageId: receipt.messageId, error: null },
    });
    result.sent++;
    budget--;
  }

  result.counts = await campaignCounts(campaign.id);
  result.remaining = result.counts.pending;
  if (result.remaining === 0) {
    const closed = await prisma.emailCampaign.updateMany({
      where: { id: campaign.id, status: "sending" },
      data: { status: "sent", sentAt: now },
    });
    result.finished = closed.count === 1;
  }
  return result;
}

// ---- unsubscribe -------------------------------------------------------------------
export interface UnsubscribeResult {
  found: boolean;
  email?: string;
  alreadyDone?: boolean;
}

async function suppress(organizationId: string, email: string, reason: "unsubscribe" | "bounce", source: string) {
  const lower = email.trim().toLowerCase();
  await prisma.suppression.upsert({
    where: { organizationId_email: { organizationId, email: lower } },
    create: { organizationId, email: lower, reason, source },
    update: {},
  });
}

/** The address a recipient id belongs to, for the confirmation page. Changes nothing. */
export async function recipientForUnsubscribe(recipientId: string): Promise<{ email: string; done: boolean } | null> {
  const r = await prisma.emailRecipient.findUnique({ where: { id: recipientId }, select: { email: true, status: true } });
  return r ? { email: r.email, done: r.status === "unsubscribed" } : null;
}

/** Stop all future email to this recipient's address. Safe to call twice. */
export async function unsubscribeRecipient(recipientId: string, source: string): Promise<UnsubscribeResult> {
  const r = await prisma.emailRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true, email: true, status: true, campaignId: true, campaign: { select: { organizationId: true } } },
  });
  if (!r) return { found: false };
  await suppress(r.campaign.organizationId, r.email, "unsubscribe", source);

  const changed = await prisma.emailRecipient.updateMany({
    where: { id: r.id, status: { not: "unsubscribed" } },
    data: { status: "unsubscribed" },
  });
  if (changed.count === 0) return { found: true, email: r.email, alreadyDone: true };

  await prisma.emailCampaign.update({ where: { id: r.campaignId }, data: { unsubscribes: { increment: 1 } } });
  await writeAuditLog({
    organizationId: r.campaign.organizationId,
    action: "email_campaign.unsubscribe",
    entity: "EmailRecipient",
    entityId: r.id,
    meta: { source },
  });
  return { found: true, email: r.email, alreadyDone: false };
}

// ---- delivery events from the email service -----------------------------------------
/** Apply one provider event to the campaign email it belongs to. */
export async function applyCampaignEvent(input: {
  type: EmailEventType;
  providerMessageId: string;
  at: Date;
}): Promise<{ matched: boolean; suppressed?: boolean }> {
  const r = await prisma.emailRecipient.findFirst({
    where: { providerMessageId: input.providerMessageId },
    select: { id: true, email: true, campaignId: true, campaign: { select: { organizationId: true } } },
  });
  if (!r) return { matched: false };

  if (input.type === "delivered") return { matched: true };

  if (input.type === "opened" || input.type === "clicked") {
    // A click also proves an open. Each is counted once per recipient.
    const opened = await prisma.emailRecipient.updateMany({ where: { id: r.id, openedAt: null }, data: { openedAt: input.at } });
    if (opened.count === 1) await prisma.emailCampaign.update({ where: { id: r.campaignId }, data: { opens: { increment: 1 } } });
    if (input.type === "clicked") {
      const clicked = await prisma.emailRecipient.updateMany({ where: { id: r.id, clickedAt: null }, data: { clickedAt: input.at } });
      if (clicked.count === 1) await prisma.emailCampaign.update({ where: { id: r.campaignId }, data: { clicks: { increment: 1 } } });
    }
    return { matched: true };
  }

  if (input.type === "bounced") {
    await suppress(r.campaign.organizationId, r.email, "bounce", "provider:bounced");
    await prisma.emailRecipient.updateMany({
      where: { id: r.id, status: { not: "unsubscribed" } },
      data: { status: "bounced", error: "Email bounced" },
    });
    return { matched: true, suppressed: true };
  }

  // Marked as spam: treat exactly like an unsubscribe.
  await unsubscribeRecipient(r.id, "provider:complained");
  return { matched: true, suppressed: true };
}
