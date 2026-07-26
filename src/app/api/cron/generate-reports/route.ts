import { NextResponse } from "next/server";
import { generateDueReports } from "@/lib/report-scheduler";
import { telemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-friendly endpoint that generates AI summaries for due reports.
 * Auth is a shared secret (CRON_SECRET) supplied via the `x-cron-secret`
 * header or `Authorization: Bearer <secret>` — NOT a user session. Fails
 * closed when the secret is not configured.
 *
 * Schedule externally, e.g.:
 *   *\/15 * * * *  curl -H "x-cron-secret: $CRON_SECRET" https://app/api/cron/generate-reports
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  if (provided !== secret) {
    await telemetry.warn({
      source: "cron.generate-reports",
      message: "Rejected cron request: bad or missing secret",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId") ?? undefined;

  try {
    const generated = await generateDueReports(organizationId);
    return NextResponse.json({ ok: true, generated: generated.length, reports: generated });
  } catch (err) {
    await telemetry.error({
      source: "cron.generate-reports",
      message: err instanceof Error ? err.message : String(err),
      organizationId: organizationId ?? null,
    });
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
