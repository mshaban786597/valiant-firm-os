import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authEnvStatus, isAuthConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Public health check for the deployment. Returns only booleans + sanitized
 * env-var *names* and presence — never values, connection strings, secrets,
 * user records or stack traces. Safe to hit from a browser or uptime monitor.
 *
 *   GET /api/health  →  { ok, server, database, schema, authConfigured, env[] }
 */
export async function GET() {
  const server = true;
  let database = false;
  let schema = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
    // Cheap check that core auth tables exist (counts, not contents).
    await prisma.user.count();
    await prisma.organizationMember.count();
    schema = true;
  } catch {
    // Swallow details — never leak DB errors to the public endpoint.
  }

  const authConfigured = isAuthConfigured();
  const env = authEnvStatus().map((e) => ({
    name: e.name,
    present: e.present,
    ...(e.note ? { note: e.note } : {}),
  }));

  const ok = server && database && schema && authConfigured;

  return NextResponse.json(
    { ok, server, database, schema, authConfigured, env },
    { status: ok ? 200 : 503 },
  );
}
