import { prisma } from "@/lib/prisma";

/**
 * Outbound notifications: Email (Resend), Slack (incoming webhook), Telegram
 * (bot). Each channel is env-gated.
 *
 * Delivery states (never inflated):
 *  - skipped  nothing was attempted (channel not configured, or a fixture record)
 *  - sent     the provider accepted the message (its reference is stored when
 *             it returns one). None of these providers confirm final delivery.
 *  - failed   the attempt was made and the provider rejected it / was unreachable
 *
 * Never throws: alerting must not break the flow that triggered it.
 */

export type NotificationEvent =
  | "incident_opened"
  | "incident_resolved"
  | "new_lead"
  | "approval_requested"
  | "report_ready"
  | "test";

import { channelStatus, type Channel } from "@/lib/notifications/channels";

export { channelSetup, channelStatus, type Channel } from "@/lib/notifications/channels";

export interface NotificationInput {
  organizationId: string;
  event: NotificationEvent;
  title: string;
  body?: string | null;
  severity?: "info" | "warning" | "critical";
  /** Deep link path inside the app, e.g. "/monitoring". */
  path?: string;
  /** Events on fixture records are logged but never leave the app. */
  isDemo?: boolean;
}

type Env = Record<string, string | undefined>;

const EVENT_LABEL: Record<NotificationEvent, string> = {
  incident_opened: "Website issue",
  incident_resolved: "Resolved",
  new_lead: "New lead",
  approval_requested: "Needs your review",
  report_ready: "Report ready",
  test: "Test",
};

/** Pure: build the subject + plain-text body shared by every channel. */
export function formatNotification(
  input: Omit<NotificationInput, "organizationId">,
  appUrl?: string,
): { subject: string; text: string } {
  const sev = input.severity && input.severity !== "info" ? ` [${input.severity.toUpperCase()}]` : "";
  const subject = `${EVENT_LABEL[input.event]}${sev}: ${input.title}`.slice(0, 200);
  const lines = [subject];
  if (input.body) lines.push("", input.body);
  if (appUrl && input.path) lines.push("", `${appUrl.replace(/\/$/, "")}${input.path}`);
  return { subject, text: lines.join("\n") };
}

interface SendOutcome {
  error: string | null;
  ref: string | null;
}

async function post(url: string, init: RequestInit, pickRef: (json: unknown) => string | null): Promise<SendOutcome> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return { error: `HTTP ${res.status}`, ref: null };
  let ref: string | null = null;
  try {
    ref = pickRef(await res.clone().json());
  } catch {
    ref = null; // e.g. Slack answers with the plain text "ok"
  }
  return { error: null, ref };
}

export const SENDERS: Record<Channel, (m: { subject: string; text: string }, env: Env) => Promise<SendOutcome>> = {
  email: (m, env) =>
    post(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.ALERT_EMAIL_FROM || "Valiant Agency OS <onboarding@resend.dev>",
          to: [env.ALERT_EMAIL_TO],
          subject: m.subject,
          text: m.text,
        }),
      },
      (j) => (j as { id?: string } | null)?.id ?? null,
    ),
  slack: (m, env) =>
    post(
      env.SLACK_WEBHOOK_URL!,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: m.text }),
      },
      () => null,
    ),
  telegram: (m, env) =>
    post(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: m.text }),
      },
      (j) => {
        const id = (j as { result?: { message_id?: number } } | null)?.result?.message_id;
        return id === undefined ? null : String(id);
      },
    ),
};

export interface NotifyResult {
  channel: Channel;
  status: "sent" | "skipped" | "failed";
  error?: string;
  providerRef?: string;
}

export async function notify(input: NotificationInput, env: Env = process.env): Promise<NotifyResult[]> {
  const configured = channelStatus(env);
  const message = formatNotification(input, env.NEXTAUTH_URL);
  const channels: Channel[] = ["email", "slack", "telegram"];

  const results = await Promise.all(
    channels.map(async (channel): Promise<NotifyResult> => {
      if (input.isDemo) {
        return { channel, status: "skipped", error: "Fixture record: external delivery is disabled" };
      }
      if (!configured[channel]) return { channel, status: "skipped", error: "Channel not configured" };
      try {
        const out = await SENDERS[channel](message, env);
        return out.error
          ? { channel, status: "failed", error: out.error }
          : { channel, status: "sent", providerRef: out.ref ?? undefined };
      } catch (err) {
        return { channel, status: "failed", error: err instanceof Error ? err.name : "send error" };
      }
    }),
  );

  try {
    await prisma.notificationLog.createMany({
      data: results.map((r) => ({
        organizationId: input.organizationId,
        channel: r.channel,
        event: input.event,
        title: message.subject,
        status: r.status,
        error: r.error ?? null,
        providerRef: r.providerRef ?? null,
        isDemo: input.isDemo ?? false,
      })),
    });
  } catch {
    // logging is best-effort
  }
  return results;
}
