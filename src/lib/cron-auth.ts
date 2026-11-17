import { NextResponse } from "next/server";

/** Shared gate for scheduled endpoints: header `x-cron-secret` or `Authorization: Bearer`. */
export function requireCronSecret(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
