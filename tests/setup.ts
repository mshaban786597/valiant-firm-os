// Global test setup: tests must be hermetic and offline.
//
// Two layers, because either one alone has leaked before (a route test once sent
// real "New lead" alerts to Telegram as soon as a chat ID was added to .env):
//
// 1. Blank every credential that makes the app talk to the outside world. They
//    are set to "" rather than deleted: libraries that load .env later only fill
//    in names that are missing, so a deleted name would come straight back.
// 2. Replace the real fetch with one that refuses. A test that needs a response
//    passes its own fetch or stubs the global one.

const OUTBOUND = [
  "ANTHROPIC_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "RESEND_API_KEY",
  "ALERT_EMAIL_TO",
  "SLACK_WEBHOOK_URL",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "OUTREACH_LIVE_SENDING",
  "ALLOW_OUTBOUND_WEBHOOKS",
];
for (const name of OUTBOUND) process.env[name] = "";

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let host = "unknown host";
  try {
    host = new URL(url).host;
  } catch {
    // keep the placeholder
  }
  throw new Error(`Real network call blocked in tests (${host})`);
}) as typeof fetch;
