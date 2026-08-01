/**
 * Lightweight structured request/error logging for API routes.
 *
 * Next middleware is excluded from /api, so logging is opt-in per route via
 * `withApiLogging`. Emits one JSON line per request (method, path, status,
 * duration, orgId when known) — parseable by any log drain, no new deps, and
 * never logs bodies, secrets, or query strings with sensitive params.
 */

export interface ApiLogFields {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  organizationId?: string | null;
  error?: string;
}

/** Pure: build the structured log line (also used in tests). */
export function formatApiLog(fields: ApiLogFields): string {
  return JSON.stringify({
    kind: "api",
    method: fields.method,
    path: fields.path,
    status: fields.status,
    durationMs: fields.durationMs,
    ...(fields.organizationId ? { orgId: fields.organizationId } : {}),
    ...(fields.error ? { error: fields.error } : {}),
  });
}

type RouteHandler = (req: Request, ctx?: unknown) => Promise<Response>;

/**
 * Wrap a route handler to log method/path/status/duration and surface errors as
 * a sanitized 500 (never leaks the stack to the client).
 */
export function withApiLogging(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    const started = Date.now();
    const path = (() => {
      try {
        return new URL(req.url).pathname;
      } catch {
        return req.url;
      }
    })();
    try {
      const res = await handler(req, ctx);
      const line = formatApiLog({
        method: req.method,
        path,
        status: res.status,
        durationMs: Date.now() - started,
      });
      if (res.status >= 500) console.error(line);
      else console.log(line);
      return res;
    } catch (err) {
      console.error(
        formatApiLog({
          method: req.method,
          path,
          status: 500,
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.name : "unknown",
        }),
      );
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
