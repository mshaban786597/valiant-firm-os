/**
 * Which alert channels are configured. Reads setting names only and holds no
 * sending code, so it is safe to bundle into a page.
 */
type Env = Record<string, string | undefined>;

export type Channel = "email" | "slack" | "telegram";

export function channelStatus(env: Env = process.env): Record<Channel, boolean> {
  return {
    email: !!env.RESEND_API_KEY && !!env.ALERT_EMAIL_TO,
    slack: !!env.SLACK_WEBHOOK_URL,
    telegram: !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID,
  };
}

/** What each channel still needs before it can deliver (env var names only). */
export function channelSetup(env: Env = process.env): Record<Channel, string[]> {
  const missing = (keys: string[]) => keys.filter((k) => !env[k]);
  return {
    email: missing(["RESEND_API_KEY", "ALERT_EMAIL_TO"]),
    slack: missing(["SLACK_WEBHOOK_URL"]),
    telegram: missing(["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]),
  };
}
