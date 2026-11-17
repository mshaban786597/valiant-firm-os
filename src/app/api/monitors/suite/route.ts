import { NextResponse } from "next/server";
import { z } from "zod";
import { MonitorType } from "@prisma/client";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { WEBSITE_SUITE, normalizeSiteUrl, suiteDbFields } from "@/lib/monitoring/analyzers";
import { getDataScope } from "@/lib/scope";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().min(3).max(500),
  label: z.string().max(80).optional(),
  clientId: z.string().uuid().nullable().optional(),
  environment: z.enum(["production", "staging"]).default("production"),
  owner: z.string().max(120).optional(),
});

/** Add a website: creates the full monitor suite (skips types that already exist). */
export async function POST(req: Request) {
  const org = await requirePermission("monitor.write");
  if (!org.ok) return org.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const url = normalizeSiteUrl(parsed.data.url);
  if (!url) return NextResponse.json({ error: "Enter a valid website URL" }, { status: 400 });

  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: org.organizationId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });
  }

  const existing = await prisma.monitor.findMany({
    where: { organizationId: org.organizationId, target: url },
    select: { type: true, kind: true },
  });
  const have = existing.map((e) => e.kind ?? (e.type as string));
  const site = parsed.data.label?.trim() || new URL(url).host;
  const toCreate = WEBSITE_SUITE.filter((s) => have.indexOf(s.type) === -1);

  await prisma.monitor.createMany({
    data: toCreate.map((s) => ({
      organizationId: org.organizationId,
      clientId: parsed.data.clientId ?? null,
      name: `${site} — ${s.label}`,
      type: suiteDbFields(s).type as MonitorType,
      kind: suiteDbFields(s).kind,
      target: url,
      cadenceMinutes: s.cadenceMinutes,
      confirmAfter: s.confirmAfter,
      environment: parsed.data.environment,
      owner: parsed.data.owner ?? null,
      isDemo: getDataScope().isDemo,
    })),
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "monitor.suite_create",
    entity: "Monitor",
    entityId: url,
    meta: { created: toCreate.length },
  });

  return NextResponse.json({ url, created: toCreate.length, skipped: have.length });
}
