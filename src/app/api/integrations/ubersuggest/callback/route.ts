import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { open, seal } from "@/lib/crypto/seal";
import { UBERSUGGEST_MCP, exchangeCode } from "@/lib/integrations/mcp-oauth";
import { UBERSUGGEST } from "@/lib/integrations/ubersuggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "vf_oauth_ubersuggest";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Ubersuggest sends the person back here after they approve (or refuse). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (query: string) => {
    const res = NextResponse.redirect(`${origin}/integrations?${query}`);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/integrations/ubersuggest", maxAge: 0 });
    return res;
  };
  const failed = (reason: string) => done(`ubersuggest=failed&reason=${encodeURIComponent(reason)}`);

  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  if (url.searchParams.get("error")) return failed("The sign-in was not approved at Ubersuggest");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const proofRaw = open(cookies().get(OAUTH_COOKIE)?.value);
  if (!code || !state || !proofRaw) return failed("The sign-in could not be verified. Start again from Connect.");

  let proof: { state?: string; verifier?: string; redirectUri?: string; organizationId?: string };
  try {
    proof = JSON.parse(proofRaw) as typeof proof;
  } catch {
    return failed("The sign-in could not be verified. Start again from Connect.");
  }
  if (!proof.state || !proof.verifier || !proof.redirectUri || !same(proof.state, state) || proof.organizationId !== org.organizationId) {
    return failed("The sign-in could not be verified. Start again from Connect.");
  }

  const connection = await prisma.oAuthConnection.findUnique({
    where: { organizationId_provider: { organizationId: org.organizationId, provider: UBERSUGGEST } },
  });
  if (!connection || connection.redirectUri !== proof.redirectUri) return failed("The sign-in was started from a different address. Start again from Connect.");

  const tokens = await exchangeCode(UBERSUGGEST_MCP, {
    clientId: connection.clientId,
    redirectUri: connection.redirectUri,
    code,
    verifier: proof.verifier,
  });
  if (!tokens.ok) {
    await prisma.oAuthConnection.update({ where: { id: connection.id }, data: { lastError: tokens.detail } });
    return failed(`Ubersuggest did not complete the sign-in (${tokens.detail})`);
  }

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: seal(tokens.data.accessToken),
      refreshTokenEnc: tokens.data.refreshToken ? seal(tokens.data.refreshToken) : null,
      expiresAt: tokens.data.expiresAt,
      scope: tokens.data.scope,
      status: "connected",
      lastError: null,
      connectedBy: org.userId,
    },
  });
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "integration.oauth.connected",
    entity: "Integration",
    entityId: UBERSUGGEST,
  });
  return done("ubersuggest=connected");
}
