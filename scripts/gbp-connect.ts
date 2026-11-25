/**
 * Find every Google Business Profile the service account manages, register it
 * and sync it. Same functions the Business Profiles page buttons use. When
 * Google blocks the call, it prints which of the prerequisites is missing.
 *
 *   npx tsx --env-file=.env scripts/gbp-connect.ts [--no-sync]
 *
 * Prerequisites, in order:
 *   1. Enable in Google Cloud: My Business Account Management API,
 *      My Business Business Information API, Business Profile Performance API.
 *   2. Google must approve the project for the Business Profile APIs
 *      ("Application for Basic API Access"). Until then its quota is 0.
 *   3. Add the service-account email as a Manager on each Business Profile.
 */
import { prisma } from "../src/lib/prisma";
import { discoverGbpLocations, syncGbpLocation } from "../src/lib/integrations/gbp-sync";
import { parseServiceAccount } from "../src/lib/integrations/google-auth";

async function main() {
  const email = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)?.client_email;
  console.log(`Service account: ${email ?? "(not configured)"}`);
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const found = await discoverGbpLocations(org.id);
  console.log(`Discover: ${found.ok ? "OK" : "BLOCKED"} [${found.state}] — ${found.message}`);
  if (!found.ok || process.argv.includes("--no-sync")) return;

  const locations = await prisma.gbpLocation.findMany({
    where: { organizationId: org.id, dataSource: "live" },
    orderBy: { businessName: "asc" },
    include: { client: { select: { businessName: true } } },
  });
  let okCount = 0;
  for (const l of locations) {
    const r = await syncGbpLocation(l);
    if (r.ok) okCount += 1;
    console.log(`  ${l.businessName}${l.client ? ` → client ${l.client.businessName}` : ""}\n    ${r.ok ? "OK" : "FAILED"} [${r.state}] — ${r.message}`);
  }
  console.log(`\n${okCount}/${locations.length} synced.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
