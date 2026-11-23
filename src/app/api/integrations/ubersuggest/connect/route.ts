import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { seal } from "@/lib/crypto/seal";
import { UBERSUGGEST_MCP, authorizeUrl, newState, pkcePair, registerClient } from "@/lib/integrations/mcp-oauth";
import { UBERSUGGEST } from "@/lib/integrations/ubersuggest";
import { publicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "vf_oauth_ubersuggest";

/**
 * Start the Ubersuggest sign-in: register this app with Ubersuggest if needed,
 * then send the person to Ubersuggest's own approval page. Nothing is stored
 * as connected until they approve and come back.
 */
export async function GET(req: Request) {
  const org = await requirePermission("integration.write");
  if (!org.ok) return org.response;

  // The address the browser must come back to (not the internal listen address behind a proxy).
  const origin = publicOrigin(req);
  const redirectUri = `${origin}/api/integrations/ubersuggest/callback`;
  const back = (reason: string) => NextResponse.redirect(`${origin}/integrations?ubersuggest=failed&reason=${encodeURIComponent(reason)}`);

  let connection = await prisma.oAuthConnection.findUnique({
    where: { organizationId_provider: { organizationId: org.organizationId, provider: UBERSUGGEST } },
  });
  // A client registration belongs to one return address: register again if it changed.
  if (!connection || connection.redirectUri !== redirectUri) {
    const reg = await registerClient(UBERSUGGEST_MCP, redirectUri);
    if (!reg.ok) return back(`Ubersuggest did not accept the registration (${reg.detail})`);
    const data = {
      clientId: reg.data.clientId,
      redirectUri,
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: null,
      status: "pending",
      lastError: null,
    };
    connection = connection
      ? await prisma.oAuthConnection.update({ where: { id: connection.id }, data })
      : await prisma.oAuthConnection.create({ data: { organizationId: org.organizationId, provider: UBERSUGGEST, ...data } });
  }

  const { verifier, challenge } = pkcePair();
  const state = newState();
  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "integration.oauth.start",
    entity: "Integration",
    entityId: UBERSUGGEST,
  });

  const res = NextResponse.redirect(authorizeUrl(UBERSUGGEST_MCP, { clientId: connection.clientId, redirectUri, state, challenge }));
  // The proof for the return trip stays in an encrypted, short-lived cookie the page scripts cannot read.
  res.cookies.set(OAUTH_COOKIE, seal(JSON.stringify({ state, verifier, redirectUri, organizationId: org.organizationId })), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.indexOf("https://") === 0,
    path: "/api/integrations/ubersuggest",
    maxAge: 600,
  });
  return res;
}
