import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { portalTokenCreateSchema } from "@/lib/schemas/portal";

async function loadClient(clientId: string, organizationId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const client = await loadClient(params.id, org.organizationId);
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tokens = await prisma.clientPortalToken.findMany({
    where: { clientId: client.id, organizationId: org.organizationId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return NextResponse.json({ tokens });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const client = await loadClient(params.id, org.organizationId);
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => ({}));
  const parsed = portalTokenCreateSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
  );

  const row = await prisma.clientPortalToken.create({
    data: {
      organizationId: org.organizationId,
      clientId: client.id,
      token,
      label: parsed.data.label ?? null,
      expiresAt,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "portal_token.create",
    entity: "ClientPortalToken",
    entityId: row.id,
    meta: { clientId: client.id, expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json({
    token: row.token,
    expiresAt: row.expiresAt.toISOString(),
    // Shareable read-only link the client can open.
    portalPath: `/portal/${row.token}`,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get("tokenId");
  if (!tokenId) {
    return NextResponse.json({ error: "tokenId required" }, { status: 400 });
  }

  const existing = await prisma.clientPortalToken.findFirst({
    where: {
      id: tokenId,
      clientId: params.id,
      organizationId: org.organizationId,
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.clientPortalToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "portal_token.revoke",
    entity: "ClientPortalToken",
    entityId: existing.id,
  });

  return NextResponse.json({ ok: true });
}
