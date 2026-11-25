/**
 * List one of our own lead-generation sites as a rank-and-rent asset.
 *
 *   npx tsx --env-file=.env scripts/add-rank-rent.ts example.com "Niche" "City" ST [--status Ranking]
 *
 * Target keywords are filled from the site's real Search Console queries, when
 * connected. Renter and rent are left empty: set them on the page.
 */
import { RankRentStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { liveForDomains } from "../src/lib/rank-rent/live";
import { rankRentCreateSchema } from "../src/lib/schemas/rank-rent";
import { writeAuditLog } from "../src/lib/audit";

async function main() {
  const [domain, niche, city, state] = process.argv.slice(2);
  const i = process.argv.indexOf("--status");
  const parsed = rankRentCreateSchema.safeParse({ domain, niche, city, state, status: i !== -1 ? process.argv[i + 1] : undefined });
  if (!parsed.success) throw new Error('Usage: add-rank-rent example.com "Niche" "City" ST [--status Ranking]');
  const d = parsed.data;

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const live = (await liveForDomains(org.id, [d.domain]))[d.domain];
  const data = {
    niche: d.niche,
    city: d.city,
    state: d.state,
    status: (d.status ?? "SiteBuilt") as RankRentStatus,
    targetKeywords: live?.topQueries.map((q) => q.query) ?? [],
  };
  const existing = await prisma.rankRentAsset.findFirst({ where: { organizationId: org.id, domain: d.domain }, select: { id: true } });
  const asset = existing
    ? await prisma.rankRentAsset.update({ where: { id: existing.id }, data })
    : await prisma.rankRentAsset.create({ data: { organizationId: org.id, domain: d.domain, ...data } });
  await writeAuditLog({
    organizationId: org.id,
    action: existing ? "rankrent.update" : "rankrent.create",
    entity: "RankRentAsset",
    entityId: asset.id,
    meta: { domain: d.domain, source: "scripts/add-rank-rent" },
  });

  console.log(`${existing ? "Updated" : "Added"}: ${asset.domain} · ${asset.niche} · ${asset.city}, ${asset.state} · ${asset.status}`);
  console.log(
    `  Google: ${live?.google ? `${live.google.clicks} clicks, ${live.google.impressions} impressions` : "not connected"} | Analytics: ${
      live?.analytics ? `${live.analytics.sessions} sessions, ${live.analytics.keyEvents} key events (${live.analytics.properties} properties)` : "not connected"
    } | checks: ${live?.checks ?? 0}, open issues: ${live?.openIncidents ?? 0}, pages: ${live?.pagesInSitemap ?? "unknown"}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
