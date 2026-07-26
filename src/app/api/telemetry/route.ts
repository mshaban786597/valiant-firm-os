import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordTelemetry, type TelemetryLevel } from "@/lib/telemetry";

const bodySchema = z.object({
  level: z.enum(["info", "warn", "error"]).default("error"),
  source: z.string().max(120).default("client"),
  message: z.string().max(2000),
  digest: z.string().max(200).nullable().optional(),
  path: z.string().max(500).nullable().optional(),
});

/**
 * Client-side telemetry sink. The app error boundary posts here so browser
 * failures are captured server-side. Org/user context is taken from the
 * session (never trusted from the body) so events are correctly scoped.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);

  await recordTelemetry({
    level: parsed.data.level as TelemetryLevel,
    source: `client.${parsed.data.source}`,
    message: parsed.data.message,
    organizationId: session?.organizationId ?? null,
    userId: session?.user?.id ?? null,
    meta: {
      digest: parsed.data.digest ?? undefined,
      path: parsed.data.path ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
