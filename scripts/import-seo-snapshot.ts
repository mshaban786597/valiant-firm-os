/**
 * Store third-party SEO data for a domain as dated snapshots.
 *
 *   npm run seo:import -- path/to/snapshot.json
 *
 * File shape:
 *   { "domain": "example.com", "provider": "ubersuggest", "location": "United States",
 *     "observedAt": "2026-11-17T00:00:00Z",
 *     "snapshots": [ { "kind": "domain_overview", "data": { ... } }, ... ] }
 *
 * Each import adds new rows, so earlier snapshots stay as history.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run seo:import -- path/to/snapshot.json");
  const input = JSON.parse(readFileSync(file, "utf8")) as {
    domain: string;
    provider: string;
    location?: string;
    observedAt?: string;
    snapshots: { kind: string; data: unknown }[];
  };
  if (!input.domain || !input.provider || !Array.isArray(input.snapshots) || input.snapshots.length === 0) {
    throw new Error("Snapshot file needs domain, provider and at least one snapshot.");
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
  const res = await prisma.seoSnapshot.createMany({
    data: input.snapshots.map((s) => ({
      organizationId: org.id,
      domain: input.domain.toLowerCase(),
      provider: input.provider,
      kind: s.kind,
      location: input.location ?? null,
      data: s.data as object,
      observedAt,
    })),
  });
  console.log(`Stored ${res.count} ${input.provider} snapshot(s) for ${input.domain} (observed ${observedAt.toISOString()}).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
