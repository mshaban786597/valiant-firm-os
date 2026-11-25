import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { open } from "@/lib/crypto/seal";
import { UBERSUGGEST_MCP } from "@/lib/integrations/mcp-oauth";
import { UBERSUGGEST, refreshUbersuggestSnapshot } from "@/lib/integrations/ubersuggest";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disconnect") }),
  z.object({
    action: z.literal("refresh"),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  }),
]);

/** Disconnect Ubersuggest, or store a fresh snapshot for one of our websites. */
export async function POST(req: Request) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  if (parsed.data.action === "disconnect") {
    const c = await prisma.oAuthConnection.findUnique({
      where: { organizationId_provider: { organizationId: org.organizationId, provider: UBERSUGGEST } },
    });
    if (c) {
      // Tell Ubersuggest to forget the sign-in too; our copy is removed either way.
      const token = open(c.refreshTokenEnc) ?? open(c.accessTokenEnc);
      if (token && UBERSUGGEST_MCP.revocationEndpoint) {
        await fetch(UBERSUGGEST_MCP.revocationEndpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token, client_id: c.clientId }).toString(),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
      }
      await prisma.oAuthConnection.update({
        where: { id: c.id },
        data: { accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null, status: "pending", lastError: null },
      });
    }
    await writeAuditLog({
      organizationId: org.organizationId,
      userId: org.userId,
      action: "integration.oauth.disconnected",
      entity: "Integration",
      entityId: UBERSUGGEST,
    });
    return NextResponse.json({ ok: true, message: "Ubersuggest disconnected. Snapshots already stored are kept." });
  }

  // Only our own registered websites: this is not a general lookup tool.
  const domain = parsed.data.domain;
  const site = await prisma.site.findUnique({ where: { organizationId_domain: { organizationId: org.organizationId, domain } }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "That website is not in the Websites register." }, { status: 404 });

  const r = await refreshUbersuggestSnapshot(org.organizationId, domain);
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "ubersuggest.refresh",
    entity: "Site",
    entityId: site.id,
    meta: { domain, ok: r.ok },
  });
  return r.ok
    ? NextResponse.json({ ok: true, message: `${domain}: ${r.data.keywords} ranking keywords stored.` })
    : NextResponse.json({ error: r.detail, state: r.state }, { status: r.state === "connected" ? 502 : 409 });
}
