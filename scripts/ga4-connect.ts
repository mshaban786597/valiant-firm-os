/**
 * Find every Google Analytics 4 property the service account can read,
 * register it, link it to the client with the same website, and sync it.
 * Same functions the Analytics page buttons use.
 *
 *   npx tsx --env-file=.env scripts/ga4-connect.ts               discover + sync all
 *   npx tsx --env-file=.env scripts/ga4-connect.ts --no-sync     discover only
 *   npx tsx --env-file=.env scripts/ga4-connect.ts --pending     sync only the ones not synced yet
 *
 * To make a property readable: Analytics > Admin > Account access management >
 * add the service-account email with the Viewer role.
 */
import { prisma } from "../src/lib/prisma";
import { discoverGa4Properties, syncGa4Property } from "../src/lib/integrations/ga4-sync";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The database connection drops now and then: try a few times before giving up. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n").filter(Boolean).pop() : String(e);
      console.log(`    ${label}: attempt ${attempt} failed (${(msg ?? "").slice(0, 90)})`);
      await sleep(6000);
    }
  }
  return null;
}

async function main() {
  const pendingOnly = process.argv.includes("--pending");
  const org = await withRetry("organization", () =>
    prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } }),
  );
  if (!org) throw new Error("Database not reachable");

  if (!pendingOnly) {
    const found = await withRetry("discover", () => discoverGa4Properties(org.id));
    console.log(`Discover: ${found?.ok ? "OK" : "FAILED"} — ${found?.message ?? "database not reachable"}`);
    if (!found?.ok || process.argv.includes("--no-sync")) return;
  }

  const properties = await withRetry("list", () =>
    prisma.ga4Property.findMany({
      where: { organizationId: org.id, ...(pendingOnly ? { syncState: { not: "ok" } } : {}) },
      orderBy: { displayName: "asc" },
      include: { client: { select: { businessName: true } } },
    }),
  );
  let okCount = 0;
  for (const p of properties ?? []) {
    const r = await withRetry(p.displayName, () => syncGa4Property(p));
    if (r?.ok) okCount += 1;
    console.log(
      `  ${p.displayName} (${p.propertyId})${p.websiteUrl ? ` ${p.websiteUrl}` : ""}${p.client ? ` → client ${p.client.businessName}` : ""}\n    ${r?.ok ? "OK" : "FAILED"} — ${r?.message ?? "database not reachable"}`,
    );
  }
  console.log(`\n${okCount}/${(properties ?? []).length} synced.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
