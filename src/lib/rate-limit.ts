import { prisma } from "@/lib/prisma";

/**
 * DB-backed login throttle. In-memory counters don't work on serverless (each
 * invocation may be a fresh instance), so failed attempts are persisted and
 * counted within a rolling window, keyed by email OR IP.
 */

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MINUTES = 15;

/** Pure: is this identity locked out given its recent failure count? */
export function isLockedOut(
  recentFailures: number,
  max: number = LOGIN_MAX_FAILURES,
): boolean {
  return recentFailures >= max;
}

/** Pure: window start timestamp for a given "now". */
export function windowStart(now: Date, minutes: number = LOGIN_WINDOW_MINUTES): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

/** Count recent failed attempts for this email or IP within the window. */
export async function recentFailedLogins(
  email: string,
  ip: string,
  now: Date = new Date(),
): Promise<number> {
  const since = windowStart(now);
  return prisma.loginAttempt.count({
    where: {
      success: false,
      createdAt: { gt: since },
      OR: [{ email: email.toLowerCase() }, { ip }],
    },
  });
}

/** Record an attempt (best-effort; never throws into the caller). */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: { email: email.toLowerCase(), ip, success },
    });
  } catch {
    // non-blocking
  }
}

/**
 * Returns true when the caller is currently allowed to attempt a login.
 * On lockout, returns false so the caller can reject before checking the
 * password (avoids credential-stuffing / brute force).
 */
export async function loginAllowed(email: string, ip: string): Promise<boolean> {
  const failures = await recentFailedLogins(email, ip);
  return !isLockedOut(failures);
}

/** Best-effort cleanup of attempts older than the window (called opportunistically). */
export async function pruneOldLoginAttempts(now: Date = new Date()): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: windowStart(now, LOGIN_WINDOW_MINUTES * 4) } },
    });
  } catch {
    // non-blocking
  }
}
