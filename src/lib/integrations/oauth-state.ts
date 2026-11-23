import { prisma } from "@/lib/prisma";

/** Ids of the sign-in tools this organization has connected. */
export async function signedInTools(organizationId: string): Promise<string[]> {
  const rows = await prisma.oAuthConnection.findMany({
    where: { organizationId, status: "connected", accessTokenEnc: { not: null } },
    select: { provider: true },
  });
  return rows.map((r) => r.provider);
}
