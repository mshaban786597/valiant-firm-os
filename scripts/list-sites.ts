/**
 * Print the website register with the same live numbers the Websites page shows.
 *
 *   npx tsx --env-file=.env scripts/list-sites.ts
 */
import { prisma } from "../src/lib/prisma";
import { liveForDomains } from "../src/lib/rank-rent/live";
import { knownDomains, ownershipLabel } from "../src/lib/sites/registry";

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const [sites, domains, clients] = await Promise.all([
    prisma.site.findMany({ where: { organizationId: org.id }, include: { client: { select: { businessName: true } } } }),
    knownDomains(org.id),
    prisma.client.findMany({
      where: { organizationId: org.id, isDemo: false },
      select: { businessName: true, monthlyValue: true, status: true, _count: { select: { sites: true } } },
      orderBy: { businessName: "asc" },
    }),
  ]);
  const live = await liveForDomains(org.id, domains);
  console.log(`WEBSITES (${domains.length})`);
  for (const d of domains) {
    const s = sites.filter((x) => x.domain === d)[0];
    const l = live[d];
    console.log(
      `  ${d.padEnd(24)} ${ownershipLabel(s ? { kind: s.kind, clientName: s.client?.businessName } : null).padEnd(28)} ` +
        `google ${l?.google ? `${l.google.clicks}c/${l.google.impressions}i` : "-"} | ga4 ${l?.analytics ? `${l.analytics.sessions}s (${l.analytics.properties}p)` : "-"} | ` +
        `checks ${l?.checks ?? 0}, open ${l?.openIncidents ?? 0}`,
    );
  }
  console.log(`\nCLIENTS (${clients.length})`);
  clients.forEach((c) =>
    console.log(`  ${c.businessName.padEnd(22)} ${c.status.padEnd(8)} monthly ${c.monthlyValue === null ? "not set" : `$${c.monthlyValue}`} | websites ${c._count.sites}`),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 300) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
