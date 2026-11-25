/**
 * Compare a candidate environment against the approved baseline for mapped
 * paths and print expected / checked / failed / skipped. Read-only.
 *
 *   npm run release:verify -- <baselineOrigin> <candidateOrigin> [/path ...] [--declare "Robots"] [--save]
 *
 * --declare  a check that is expected to differ between the environments
 * --save     store the result (live scope) as a ReleaseVerification record
 */
import { PrismaClient } from "@prisma/client";
import { verifyRelease } from "@/lib/release/verify";

async function main() {
  const args = process.argv.slice(2);
  const declared: string[] = [];
  const positional: string[] = [];
  let save = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--declare") declared.push(args[++i] ?? "");
    else if (args[i] === "--save") save = true;
    else positional.push(args[i]!);
  }
  const [baselineOrigin, candidateOrigin, ...paths] = positional;
  if (!baselineOrigin || !candidateOrigin) {
    throw new Error("Usage: npm run release:verify -- <baselineOrigin> <candidateOrigin> [/path ...]");
  }
  const r = await verifyRelease({
    baselineOrigin,
    candidateOrigin,
    paths: paths.length ? paths : ["/"],
    declaredDifferences: declared,
  });
  console.log(`\nBaseline  ${baselineOrigin}\nCandidate ${candidateOrigin}\n`);
  r.items.forEach((i) =>
    console.log(
      ` ${i.result.toUpperCase().padEnd(7)} ${i.path.padEnd(18)} ${i.check.padEnd(24)} expected "${i.expected.slice(0, 60)}" actual "${i.actual.slice(0, 60)}"${i.note ? ` (${i.note})` : ""}`,
    ),
  );
  console.log(`\nExpected ${r.expected} · checked ${r.checked} · failed ${r.failed} · skipped ${r.skipped}\n`);

  if (save) {
    const prisma = new PrismaClient();
    try {
      const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
      const row = await prisma.releaseVerification.create({
        data: {
          organizationId: org.id,
          site: new URL(baselineOrigin).host,
          baselineUrl: baselineOrigin,
          candidateUrl: candidateOrigin,
          expected: r.expected,
          checked: r.checked,
          failed: r.failed,
          skipped: r.skipped,
          results: r.items as unknown as object,
        },
      });
      console.log(`Saved as release verification ${row.id}`);
    } finally {
      await prisma.$disconnect();
    }
  }
  if (r.failed) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
