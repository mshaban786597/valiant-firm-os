/**
 * Add a website to monitoring from the command line and run its first cycle.
 * Same logic as the "Add website" + "Run full cycle" buttons.
 *
 *   npm run site:add -- https://example.com "Short name"
 */
import { MonitorType, PrismaClient } from "@prisma/client";
import { WEBSITE_SUITE, normalizeSiteUrl } from "@/lib/monitoring/analyzers";
import { runMonitorsBatch } from "@/lib/monitoring/run-batch";

const prisma = new PrismaClient();

async function main() {
  const url = normalizeSiteUrl(process.argv[2] ?? "");
  if (!url) throw new Error('Usage: npm run site:add -- https://example.com "Short name"');
  const label = process.argv[3]?.trim() || new URL(url).host;

  const org = await prisma.organization.findUnique({ where: { slug: "valiant-firm" }, select: { id: true } });
  if (!org) throw new Error("Organization 'valiant-firm' not found — run db:seed first.");

  const existing = await prisma.monitor.findMany({
    where: { organizationId: org.id, target: url },
    select: { type: true },
  });
  const have = existing.map((e) => e.type as string);
  const toCreate = WEBSITE_SUITE.filter((s) => have.indexOf(s.type) === -1);
  await prisma.monitor.createMany({
    data: toCreate.map((s) => ({
      organizationId: org.id,
      name: `${label} — ${s.label}`,
      type: s.type as MonitorType,
      target: url,
      cadenceMinutes: s.cadenceMinutes,
    })),
  });
  console.log(`\n${url}: ${toCreate.length} checks created, ${have.length} already existed.`);

  const monitors = await prisma.monitor.findMany({ where: { organizationId: org.id, target: url } });
  const summary = await runMonitorsBatch(monitors, 9);
  console.log("First cycle:", JSON.stringify(summary));

  const after = await prisma.monitor.findMany({
    where: { organizationId: org.id, target: url },
    include: { checks: { orderBy: { observedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  after.forEach((m) => {
    const mark = m.lastStatus === "ok" ? "PASS" : m.lastStatus === "fail" ? "FAIL" : "N/A ";
    console.log(` ${mark}  ${m.name.padEnd(48)} ${m.checks[0]?.detail ?? ""}`);
  });
  const open = await prisma.incident.findMany({
    where: { organizationId: org.id, monitor: { target: url }, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { title: true, severity: true },
  });
  console.log(`\nOpen issues for this site: ${open.length}`);
  open.forEach((i) => console.log(` - [${i.severity}] ${i.title}`));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
