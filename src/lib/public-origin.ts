/**
 * The address people use to reach the app.
 *
 * Behind a reverse proxy (shared hosting, a CDN) `req.url` is the address the
 * app listens on inside the server, such as `https://0.0.0.0:3000`, which no
 * browser can open. Use what the proxy forwards instead, and fall back to the
 * configured public address when that is missing or internal.
 */
type Env = Record<string, string | undefined>;

const INTERNAL = /^(0\.0\.0\.0|127\.0\.0\.1|\[::1?\]|::1?)(:\d+)?$/;
const LOCAL = /^localhost(:\d+)?$/i;
const VALID_HOST = /^[a-z0-9.-]+(:\d+)?$/i;

const first = (v: string | null) => (v ?? "").split(",")[0]!.trim();

export function publicOrigin(req: Request, env: Env = process.env): string {
  const host = first(req.headers.get("x-forwarded-host")) || first(req.headers.get("host"));
  if (host && VALID_HOST.test(host) && !INTERNAL.test(host)) {
    // Plain http only ever for a developer's own machine.
    return `${LOCAL.test(host) ? "http" : "https"}://${host.toLowerCase()}`;
  }
  const configured = (env.NEXTAUTH_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^/]+$/i.test(configured)) return configured;
  return new URL(req.url).origin;
}
