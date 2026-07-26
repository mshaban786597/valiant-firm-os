/**
 * Centralized environment access + validation for auth/runtime.
 *
 * Never throws at import time (that would break the build). Instead it exposes
 * status helpers so a health check / startup log can report *clearly* which
 * required variable is missing, turning a cryptic "server configuration" auth
 * error into an actionable diagnosis. Values are never logged or returned to
 * the browser — only presence booleans.
 */

export const isProduction = process.env.NODE_ENV === "production";

/** Auth signing secret — supports both NextAuth v4 and v5 variable names. */
export function readAuthSecret(): string | undefined {
  const v = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  return v && v.trim() !== "" ? v : undefined;
}

export function readDatabaseUrl(): string | undefined {
  const v = process.env.DATABASE_URL;
  return v && v.trim() !== "" ? v : undefined;
}

export interface EnvStatus {
  name: string;
  present: boolean;
  /** Extra note (e.g. "looks like localhost") — never contains the value. */
  note?: string;
}

/** Report presence/validity of required auth+db env vars (no values leaked). */
export function authEnvStatus(): EnvStatus[] {
  const out: EnvStatus[] = [];

  const secret = readAuthSecret();
  out.push({
    name: "NEXTAUTH_SECRET",
    present: !!secret,
    note: secret === undefined ? "required in production" : undefined,
  });

  const db = readDatabaseUrl();
  let dbNote: string | undefined;
  if (!db) dbNote = "required";
  else if (/localhost|127\.0\.0\.1/.test(db)) dbNote = "points at localhost — not reachable from Vercel";
  out.push({ name: "DATABASE_URL", present: !!db, note: dbNote });

  const url = process.env.NEXTAUTH_URL;
  out.push({
    name: "NEXTAUTH_URL",
    present: !!(url && url.trim() !== ""),
    note: url && /localhost/.test(url) ? "localhost in production is wrong" : undefined,
  });

  return out;
}

/** True when all required-for-auth vars are present and sane. */
export function isAuthConfigured(): boolean {
  const s = authEnvStatus();
  const secretOk = s.find((x) => x.name === "NEXTAUTH_SECRET")?.present ?? false;
  const dbEntry = s.find((x) => x.name === "DATABASE_URL");
  const dbOk = (dbEntry?.present ?? false) && !dbEntry?.note?.includes("localhost");
  return secretOk && dbOk;
}
