import { writeAuditLog } from "@/lib/audit";

/**
 * Structured telemetry for AI calls, webhooks, and failed operations.
 *
 * Every event is emitted as a single-line JSON log (parseable by log drains)
 * and, when an organization context is available, persisted to the AuditLog
 * table so failures are queryable per-tenant. Persistence is best-effort and
 * never throws into the caller.
 */

export type TelemetryLevel = "info" | "warn" | "error";

export interface TelemetryEvent {
  level: TelemetryLevel;
  /** Dotted source, e.g. "ai.score-lead", "webhook.automation". */
  source: string;
  message: string;
  organizationId?: string | null;
  userId?: string | null;
  /** Duration in ms for timed operations. */
  durationMs?: number;
  meta?: Record<string, unknown>;
}

function emitConsole(event: TelemetryEvent) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
  });
  if (event.level === "error") console.error(line);
  else if (event.level === "warn") console.warn(line);
  else console.log(line);
}

/** Record a telemetry event: always logs, persists to AuditLog when scoped. */
export async function recordTelemetry(event: TelemetryEvent): Promise<void> {
  emitConsole(event);
  if (!event.organizationId) return;
  await writeAuditLog({
    organizationId: event.organizationId,
    userId: event.userId ?? null,
    action: `telemetry.${event.level}`,
    entity: event.source,
    meta: {
      message: event.message,
      ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      ...(event.meta ?? {}),
    },
  });
}

export const telemetry = {
  info: (e: Omit<TelemetryEvent, "level">) =>
    recordTelemetry({ ...e, level: "info" }),
  warn: (e: Omit<TelemetryEvent, "level">) =>
    recordTelemetry({ ...e, level: "warn" }),
  error: (e: Omit<TelemetryEvent, "level">) =>
    recordTelemetry({ ...e, level: "error" }),
};

export interface TelemetryContext {
  organizationId?: string | null;
  userId?: string | null;
}

/**
 * Wrap an async operation (AI call, external fetch, etc.) with timing and
 * automatic error telemetry. Re-throws so callers keep their own control flow.
 */
export async function withTelemetry<T>(
  source: string,
  ctx: TelemetryContext,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    await recordTelemetry({
      level: "info",
      source,
      message: "ok",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    await recordTelemetry({
      level: "error",
      source,
      message: err instanceof Error ? err.message : String(err),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      durationMs: Date.now() - started,
      meta: {
        name: err instanceof Error ? err.name : undefined,
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
    throw err;
  }
}
