/**
 * Check the Ubersuggest connection with real calls, and optionally refresh the
 * stored snapshot of every registered website.
 *
 *   npx tsx --env-file=.env scripts/ubersuggest-check.ts            connection + one search
 *   npx tsx --env-file=.env scripts/ubersuggest-check.ts --refresh  also refresh every website
 */
import { prisma } from "../src/lib/prisma";
import { refreshUbersuggestSnapshot, testUbersuggest, ubersuggestSerpProvider, ubersuggestState } from "../src/lib/integrations/ubersuggest";

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const state = await ubersuggestState(org.id);
  const c = await prisma.oAuthConnection.findUnique({
    where: { organizationId_provider: { organizationId: org.id, provider: "ubersuggest" } },
    select: { status: true, redirectUri: true, expiresAt: true, scope: true, refreshTokenEnc: true, updatedAt: true },
  });
  console.log(`Stored sign-in: ${state}${c ? ` | return address ${new URL(c.redirectUri).origin} | refresh token ${c.refreshTokenEnc ? "yes" : "no"} | expires ${c.expiresAt?.toISOString() ?? "not stated"}` : ""}`);
  if (state !== "connected") return;

  const t = await testUbersuggest(org.id);
  console.log(`Real call (auth_status): ${t.ok ? `OK — ${t.data.summary}` : `FAILED — ${t.detail}`}`);
  if (!t.ok) return;

  const target = await prisma.prospectTarget.findFirst({ where: { organizationId: org.id, isDemo: false }, orderBy: { createdAt: "asc" } });
  if (target) {
    const provider = ubersuggestSerpProvider(org.id);
    try {
      const results = await provider.search(target.keyword, `${target.city}, ${target.state}`);
      console.log(`Search "${target.keyword}": ${results.length} organic results, collected ${provider.collectedAt?.()?.toISOString().slice(0, 10) ?? "unknown"}; first: ${results[0]?.url}`);
    } catch (e) {
      console.log(`Search "${target.keyword}": FAILED — ${e instanceof Error ? e.message : e}`);
    }
  }

  if (!process.argv.includes("--refresh")) return;
  const sites = await prisma.site.findMany({ where: { organizationId: org.id, domain: { not: { endsWith: ".vercel.app" } } }, select: { domain: true }, orderBy: { domain: "asc" } });
  let okCount = 0;
  for (const s of sites) {
    const r = await refreshUbersuggestSnapshot(org.id, s.domain);
    if (r.ok) okCount += 1;
    console.log(`  ${s.domain}: ${r.ok ? `${r.data.keywords} ranking keywords${r.data.overview ? ", overview stored" : ""}` : `FAILED — ${r.detail}`}`);
  }
  console.log(`${okCount}/${sites.length} websites refreshed.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
