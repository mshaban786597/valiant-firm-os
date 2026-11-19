/**
 * Record whose a website is.
 *
 *   npx tsx --env-file=.env scripts/set-site.ts example.com client "Client name" [--name "Label"]
 *   npx tsx --env-file=.env scripts/set-site.ts example.com rank_rent [--name "Label"]
 *   npx tsx --env-file=.env scripts/set-site.ts example.com own [--name "Label"]
 *
 * A client website has its checks, Search Console, Analytics and open
 * incidents attached to that client. Several sites can be set in one run by
 * separating them with "--":  a.com own -- b.com client "Client name"
 */
import { prisma } from "../src/lib/prisma";
import { isSiteKind, setSite, SITE_KIND_LABEL } from "../src/lib/sites/registry";
import { writeAuditLog } from "../src/lib/audit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof Error) || !/reach database|Can't reach|ECONN|timed out/i.test(e.message)) throw e;
      await sleep(6000);
    }
  }
  throw last;
}

function groups(args: string[]): string[][] {
  const out: string[][] = [[]];
  args.forEach((a) => (a === "--" ? out.push([]) : out[out.length - 1]!.push(a)));
  return out.filter((g) => g.length);
}

async function main() {
  const org = await withRetry(() => prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } }));
  for (const g of groups(process.argv.slice(2))) {
    const i = g.indexOf("--name");
    const label = i !== -1 ? g[i + 1] : undefined;
    const rest = i !== -1 ? g.slice(0, i).concat(g.slice(i + 2)) : g;
    const [domain, kind, clientName] = rest;
    if (!domain || !isSiteKind(kind)) throw new Error('Usage: set-site example.com client "Client name" | rank_rent | own');

    let clientId: string | null = null;
    if (kind === "client") {
      const client = await withRetry(() =>
        prisma.client.findFirst({ where: { organizationId: org.id, isDemo: false, businessName: clientName ?? "" }, select: { id: true } }),
      );
      if (!client) throw new Error(`No live client named "${clientName ?? ""}" (for ${domain})`);
      clientId = client.id;
    }
    const r = await withRetry(() => setSite({ organizationId: org.id, domain, name: label ?? clientName ?? domain, kind, clientId }));
    await withRetry(() =>
      writeAuditLog({
        organizationId: org.id,
        action: r.created ? "site.create" : "site.update",
        entity: "Site",
        entityId: r.siteId,
        meta: { domain, kind, source: "scripts/set-site" },
      }),
    );
    console.log(
      `${domain}: ${SITE_KIND_LABEL[kind]}${clientName && kind === "client" ? ` → ${clientName}` : ""}` +
        (r.linked
          ? ` | linked ${r.linked.monitors} checks, ${r.linked.gscProperties} Search Console, ${r.linked.ga4Properties} Analytics, ${r.linked.incidents} incidents, ${r.linked.tasksCreated} tasks`
          : r.released
            ? ` | released ${r.released} items from a client`
            : ""),
    );
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
