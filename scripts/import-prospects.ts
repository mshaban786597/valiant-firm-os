/**
 * Run the prospecting agent on search results pulled outside the app (for
 * example from the Ubersuggest SERP tool), for when no in-app search provider
 * is connected.
 *
 *   npx tsx --env-file=.env scripts/import-prospects.ts path/to/serp.json
 *
 * File shape:
 *   { "provider": "ubersuggest", "niche": "Gutters", "keyword": "gutter installation",
 *     "city": "Tallahassee", "state": "FL", "collectedAt": "2026-10-01",
 *     "results": [ { "url": "https://example.com/", "title": "Example Gutters", "type": "organic" } ] }
 *
 * `results` must be in the order the search engine showed them. Entries whose
 * `type` is not "organic" (map pack, questions, images) are dropped and the
 * rest are numbered 1, 2, 3… so a position always means the organic rank.
 *
 * The agent keeps organic positions 11 to 50, skips directories, our own
 * sites, national pages and businesses already stored, reads each business's
 * own site for a published email and findings, and writes a draft per
 * prospect. Nothing is sent.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import type { SerpProvider } from "../src/lib/prospecting/agent";
import { runProspectTarget } from "../src/lib/prospecting/run-target";
import type { SerpResult } from "../src/lib/prospecting/rules";

type RawResult = { url: string; title?: string | null; type?: string };

export function organicOnly(raw: RawResult[]): SerpResult[] {
  return raw
    .filter((r) => (r.type ?? "organic") === "organic" && !!r.url && r.url.indexOf("NODOMAIN") === -1)
    .map((r, i) => ({ position: i + 1, url: r.url, title: r.title ?? "" }));
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx --env-file=.env scripts/import-prospects.ts path/to/serp.json");
  const input = JSON.parse(readFileSync(file, "utf8")) as {
    provider?: string;
    niche: string;
    keyword: string;
    city: string;
    state: string;
    collectedAt?: string;
    results: RawResult[];
  };
  if (!input.niche || !input.keyword || !input.city || !input.state || !Array.isArray(input.results) || input.results.length === 0) {
    throw new Error("File needs niche, keyword, city, state and at least one result.");
  }
  const results = organicOnly(input.results);
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });

  const target = await prisma.prospectTarget.upsert({
    where: {
      organizationId_keyword_city_state: {
        organizationId: org.id,
        keyword: input.keyword,
        city: input.city,
        state: input.state,
      },
    },
    create: { organizationId: org.id, niche: input.niche, keyword: input.keyword, city: input.city, state: input.state },
    update: { niche: input.niche },
  });

  const provider: SerpProvider = { name: `${input.provider ?? "serp"}_import`, search: async () => results };
  const r = await runProspectTarget(target, {
    provider,
    maxNew: 25,
    observedAt: input.collectedAt ? new Date(input.collectedAt) : undefined,
  });

  console.log(`\n${input.keyword} · ${input.city}, ${input.state}`);
  console.log(
    `organic results checked: ${r.resultsSeen} | added: ${r.added.length} | drafts waiting for approval: ${r.drafted} | no published email: ${r.noEmail}`,
  );
  console.log("skipped:", JSON.stringify(r.skipped));
  r.added.forEach((a) => console.log(`  #${a.position}  ${a.businessName}  (${a.domain})  ${a.email ?? "no email found"}`));
  console.log("\nNothing was sent. Drafts are in Review & Approvals.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
