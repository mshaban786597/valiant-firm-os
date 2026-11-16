import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { writeAuditLog } from "@/lib/audit";
import { getIntegration, testIntegration } from "@/lib/integrations/catalog";

export const runtime = "nodejs";

const schema = z.object({ id: z.string().min(1).max(60) });

/** Run a live, read-only connection test for one integration. */
export async function POST(req: Request) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const tool = getIntegration(parsed.data.id);
  if (!tool) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });

  const result = await testIntegration(tool);
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "integration.test",
    entity: "Integration",
    entityId: tool.id,
    meta: { ok: result.ok },
  });
  return NextResponse.json({ id: tool.id, ...result });
}
