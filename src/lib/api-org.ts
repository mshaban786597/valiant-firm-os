import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function requireApiOrg() {
  const session = await getServerSession(authOptions);
  if (!session?.organizationId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true as const,
    session,
    organizationId: session.organizationId,
    userId: session.user.id,
  };
}
