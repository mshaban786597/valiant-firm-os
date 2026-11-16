import { prisma } from "@/lib/prisma";

/**
 * Outbound notifications: Email (Resend), Slack (incoming webhook), Telegram
 * (bot). Each channel is env-gated — an unconfigured channel is logged as
 * "skipped", never reported as sent. Never throws: alerting must not break the
 * flow that triggered it.
 */

export type NotificationEvent =
  | "incident_opened"
  | "incident_resolved"
  | "new_lead"
  | "approval_requested"
  | "report_ready"
  | "test";

export type Channel = "email" | "slack" | "telegram";

export interface NotificationInput {
  organizationId: string;
  event: NotificationEvent;
  title: string;
  body?: string | null;
  severity?: "info" | "warning" | "critical";
  /** Deep link path inside the app, e.g. "/monitoring". */
  path?: string;
}

type Env = Record<string, string | undefined>;

export function channelStatus(env: Env = process.env): Record<Channel, boolean> {
  return {
    email: !!env.RESEND_API_KEY && !!env.ALERT_EMAIL_TO,
    slack: !!env.SLACK_WEBHOOK_URL,
    telegram: !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID,
  };
}

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

async function post(url: string, init: RequestInit): Promise<string | null> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
  return res.ok ? null : `HTTP ${res.status}`;
}

const SENDERS: Record<Channel, (m: { subject: string; text: string }, env: Env) => Promise<string | null>> = {
  email: (m, env) =>
    post("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM || "Valiant Agency OS <onboarding@resend.dev>",
        to: [env.ALERT_EMAIL_TO],
        subject: m.subject,
        text: m.text,
      }),
    }),
  slack: (m, env) =>
    post(env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: m.text }),
    }),
  telegram: (m, env) =>
    post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: m.text }),
    }),
};

export interface NotifyResult {
  channel: Channel;
  status: "sent" | "skipped" | "failed";
  error?: string;
}

export async function notify(input: NotificationInput): Promise<NotifyResult[]> {
  const env = process.env;
  const configured = channelStatus(env);
  const message = formatNotification(input, env.NEXTAUTH_URL);
  const channels: Channel[] = ["email", "slack", "telegram"];

  const results = await Promise.all(
    channels.map(async (channel): Promise<NotifyResult> => {
      if (!configured[channel]) return { channel, status: "skipped", error: "Channel not configured" };
      try {
        const error = await SENDERS[channel](message, env);
        return error ? { channel, status: "failed", error } : { channel, status: "sent" };
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
      })),
    });
  } catch {
    // logging is best-effort
  }
  return results;
}
