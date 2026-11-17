/**
 * Register Search Console properties for clients, verify read access and run
 * a first sync. Same functions the SEO page buttons use.
 *
 *   npx tsx --env-file=.env scripts/gsc-connect.ts "Client name=https://site.com/" ["Other=sc-domain:other.com"]
 *
 * The property id must match Search Console exactly (URL-prefix properties
 * end with a slash; Domain properties start with "sc-domain:").
 */
import { PrismaClient } from "@prisma/client";
import { syncGscProperty, testGscAccess } from "@/lib/integrations/gsc-sync";
import { aggregateCtr, propertyTypeOf } from "@/lib/integrations/gsc";

const prisma = new PrismaClient();

async function main() {
  const pairs = process.argv.slice(2).map((a) => {
    const i = a.indexOf("=");
    return { client: a.slice(0, i).trim(), siteUrl: a.slice(i + 1).trim() };
  });
  if (pairs.length === 0 || pairs.some((p) => !p.client || !p.siteUrl)) {
    throw new Error('Usage: gsc-connect "Client name=https://site.com/" ...');
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });

  for (const p of pairs) {
    console.log(`\n${p.client} → ${p.siteUrl}`);
    const client = await prisma.client.findFirst({
      where: { organizationId: org.id, isDemo: false, businessName: p.client },
      select: { id: true },
    });
    if (!client) {
      console.log("  SKIPPED: no live client with that name");
      continue;
    }
    const property = await prisma.gscProperty.upsert({
      where: { organizationId_siteUrl: { organizationId: org.id, siteUrl: p.siteUrl } },
      create: { organizationId: org.id, siteUrl: p.siteUrl, clientId: client.id, propertyType: propertyTypeOf(p.siteUrl) },
      update: { clientId: client.id },
    });
    await prisma.client.update({ where: { id: client.id }, data: { gscSiteUrl: p.siteUrl } });

    const access = await testGscAccess(property);
    console.log(`  Test access: ${access.ok ? "OK" : "FAILED"} — ${access.message}`);
    if (!access.ok) continue;

    const sync = await syncGscProperty(property);
    console.log(`  Sync: ${sync.ok ? "OK" : "FAILED"} — ${sync.message}`);
    if (sync.ok) {
      const ctr = aggregateCtr(sync.clicks ?? 0, sync.impressions ?? 0);
      const top = await prisma.gscMetric.findMany({
        where: { propertyId: property.id, dimension: "query" },
        orderBy: { clicks: "desc" },
        take: 3,
      });
      console.log(`  Rows stored: ${sync.rows} · CTR ${ctr === null ? "n/a" : (ctr * 100).toFixed(2) + "%"}`);
      top.forEach((t) => console.log(`    "${t.key}" — ${t.clicks} clicks, ${t.impressions} impressions, position ${t.position?.toFixed(1)}`));
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
