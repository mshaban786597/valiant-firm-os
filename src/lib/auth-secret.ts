import { readAuthSecret } from "@/lib/env";

/**
 * The auth signing secret. Supports NEXTAUTH_SECRET (v4) and AUTH_SECRET (v5).
 *
 * In development it falls back to a fixed insecure value so local dev works
 * without setup. In production it returns "" when unset — callers (middleware)
 * stay resilient, and the /api/health endpoint reports the misconfiguration
 * clearly rather than the app crashing on every request.
 */
export function authSecret(): string {
  const secret = readAuthSecret();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "dev-valiant-insecure-secret-change-me";
  }
  // Production + missing secret: surface a clear server-side log once.
  console.error(
    "[auth] NEXTAUTH_SECRET is not set in production. Sign-in will fail with a " +
      "configuration error until it is configured. See /api/health.",
  );
  return "";
}
