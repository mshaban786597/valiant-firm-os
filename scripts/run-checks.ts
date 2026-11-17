/**
 * Run live monitoring checks from the command line (same code as "Run all checks").
 *
 *   npx tsx --env-file=.env scripts/run-checks.ts              # every enabled live check
 *   npx tsx --env-file=.env scripts/run-checks.ts PAGE_SPEED   # only one kind
 */
import { PrismaClient } from "@prisma/client";
import { runMonitorsBatch } from "@/lib/monitoring/run-batch";

const prisma = new PrismaClient();

async function main() {
  const kind = process.argv[2]?.toUpperCase() ?? null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const all = await prisma.monitor.findMany({
    where: { organizationId: org.id, isDemo: false, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  const monitors = all.filter((m) => {
    const k = m.kind ?? m.type;
    if (k === "LEAD_ROUTE" || k === "CUSTOM") return false;
    return kind ? k === kind : true;
  });
  console.log(`Running ${monitors.length} check(s)${kind ? ` of kind ${kind}` : ""}…`);
  // Page speed is slow (about 20s each), so keep concurrency low for it.
  const summary = await runMonitorsBatch(monitors, kind === "PAGE_SPEED" ? 3 : 8, "operator");
  console.log("Summary:", JSON.stringify(summary));

  const after = await prisma.monitor.findMany({
    where: { id: { in: monitors.map((m) => m.id) } },
    include: { checks: { orderBy: { observedAt: "desc" }, take: 1 } },
    orderBy: { name: "asc" },
  });
  after.forEach((m) => {
    const mark = m.lastStatus === "ok" ? "PASS" : m.lastStatus === "fail" ? "FAIL" : "N/A ";
    console.log(` ${mark}  ${m.name.slice(0, 52).padEnd(52)} ${m.checks[0]?.detail ?? ""}`);
  });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
