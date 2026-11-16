/**
 * Add a website to live monitoring from the command line and run its first
 * cycle. Same logic as the "Add website" + "Run all checks" buttons.
 *
 *   npm run site:add -- https://example.com "Short name" [--routes] [--owner "Name"]
 *
 * --routes  also adds a status check for up to 5 critical internal pages found
 *           on the home page (contact, quote, service pages first).
 */
import { MonitorType, PrismaClient } from "@prisma/client";
import { WEBSITE_SUITE, extractLinks, normalizeSiteUrl } from "@/lib/monitoring/analyzers";
import { runMonitorsBatch } from "@/lib/monitoring/run-batch";
import { checkState } from "@/lib/monitoring/state";

const prisma = new PrismaClient();

async function discoverRoutes(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "ValiantFirmMonitor/1.0" }, signal: AbortSignal.timeout(12_000) });
    const html = await res.text();
    const host = new URL(res.url || url).host;
    const internal = extractLinks(html, res.url || url, 200).filter((l) => new URL(l).host === host && new URL(l).pathname !== "/");
    const score = (l: string) => (/contact|quote|estimate|schedule/i.test(l) ? 0 : /service|gutter|repair|install|about/i.test(l) ? 1 : 2);
    return internal
      .filter((l) => !/\.(jpg|jpeg|png|webp|gif|svg|pdf|css|js)(\?|$)/i.test(l))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--owner");
  const ownerIdx = args.indexOf("--owner");
  const owner = ownerIdx !== -1 ? (args[ownerIdx + 1] ?? null) : null;

  const url = normalizeSiteUrl(positional[0] ?? "");
  if (!url) throw new Error('Usage: npm run site:add -- https://example.com "Short name" [--routes] [--owner "Name"]');
  const label = positional[1]?.trim() || new URL(url).host;

  const org = await prisma.organization.findUnique({ where: { slug: "valiant-firm" }, select: { id: true } });
  if (!org) throw new Error("Organization 'valiant-firm' not found — run db:seed first.");

  const existing = await prisma.monitor.findMany({
    where: { organizationId: org.id, isDemo: false },
    select: { type: true, target: true },
  });
  const have = (type: string, target: string) => existing.some((e) => e.type === type && e.target === target);

  const rows = WEBSITE_SUITE.filter((s) => !have(s.type, url)).map((s) => ({
    organizationId: org.id,
    name: `${label} — ${s.label}`,
    type: s.type as MonitorType,
    target: url,
    cadenceMinutes: s.cadenceMinutes,
    confirmAfter: s.confirmAfter,
    environment: "production",
    owner,
  }));
  if (flags.indexOf("--routes") !== -1) {
    const routes = await discoverRoutes(url);
    routes
      .filter((r) => !have("ROUTE", r))
      .forEach((r) =>
        rows.push({
          organizationId: org.id,
          name: `${label} — Page ${new URL(r).pathname}`,
          type: MonitorType.ROUTE,
          target: r,
          cadenceMinutes: 60,
          confirmAfter: 2,
          environment: "production",
          owner,
        }),
      );
  }
  await prisma.monitor.createMany({ data: rows });
  console.log(`\n${url}: ${rows.length} checks created.`);

  const targets = [url, ...rows.filter((r) => r.type === MonitorType.ROUTE).map((r) => r.target)];
  const monitors = await prisma.monitor.findMany({
    where: { organizationId: org.id, isDemo: false, OR: [{ target: url }, { target: { in: targets } }, { name: { startsWith: `${label} — Page` } }] },
  });
  const summary = await runMonitorsBatch(monitors, 10, "operator");
  console.log("First cycle:", JSON.stringify(summary));

  const after = await prisma.monitor.findMany({
    where: { id: { in: monitors.map((m) => m.id) } },
    include: { checks: { orderBy: { observedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  const expected: Record<string, string> = {
    UPTIME: "HTTP status below 400", ROUTE: "HTTP status below 400", TLS: "HTTPS answers below 400", DNS: "at least 1 DNS record",
    INDEXING: "indexable, robots.txt not blocking", CONTENT_CHANGE: "content unchanged since last check", BROKEN_LINKS: "no 404/410/5xx links",
    SECURITY: "HTTPS and core security headers", MOBILE: "device-width viewport", PAGE_SPEED: "performance score 50+",
  };
  console.log("\n STATE        CHECK                                            EXPECTED → ACTUAL");
  after.forEach((m) => {
    const st = checkState(m).toUpperCase().padEnd(11);
    console.log(` ${st}  ${m.name.slice(0, 46).padEnd(46)}  ${expected[m.type] ?? ""} → ${m.checks[0]?.detail ?? ""}`);
  });
  const open = await prisma.incident.findMany({
    where: { organizationId: org.id, monitorId: { in: monitors.map((m) => m.id) }, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { title: true, severity: true },
  });
  console.log(`\nOpen incidents for this site: ${open.length}`);
  open.forEach((i) => console.log(` - [${i.severity}] ${i.title}`));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
