import { prisma } from "@/lib/prisma";
import { siteDomain } from "@/lib/clients/link-site";

/**
 * Live numbers for a rank-and-rent site, read from what the app already
 * measures for that domain. Nothing is estimated: a missing source is null.
 */
export interface AssetLive {
  google: { clicks: number; impressions: number; avgPosition: number | null; through: Date | null } | null;
  analytics: { sessions: number; keyEvents: number; properties: number } | null;
  pagesInSitemap: number | null;
  checks: number;
  openIncidents: number;
  topQueries: { query: string; impressions: number; position: number | null }[];
}

/** Pick the Analytics property with the most sessions; two tags on one site would otherwise be counted twice. */
export function mainAnalytics(rows: { sessions28d: number; keyEvents28d: number }[]): AssetLive["analytics"] {
  if (rows.length === 0) return null;
  const main = rows.slice().sort((a, b) => b.sessions28d - a.sessions28d)[0]!;
  return { sessions: main.sessions28d, keyEvents: main.keyEvents28d, properties: rows.length };
}

export function pagesFromCrawlState(state: unknown): number | null {
  const n = (state as { findings?: { pagesInSitemap?: unknown } } | null)?.findings?.pagesInSitemap;
  return typeof n === "number" && n >= 0 ? n : null;
}

export async function liveForDomains(organizationId: string, domains: string[]): Promise<Record<string, AssetLive>> {
  const wanted: Record<string, true> = {};
  domains.forEach((d) => {
    const k = siteDomain(d);
    if (k) wanted[k] = true;
  });
  const [gsc, ga4, monitors] = await Promise.all([
    prisma.gscProperty.findMany({
      where: { organizationId, dataSource: "live" },
      select: { id: true, siteUrl: true, clicks28d: true, impressions28d: true, avgPosition: true, dataThrough: true },
    }),
    prisma.ga4Property.findMany({
      where: { organizationId, syncState: "ok" },
      select: { websiteUrl: true, sessions28d: true, keyEvents28d: true },
    }),
    prisma.monitor.findMany({
      where: { organizationId, isDemo: false },
      select: { id: true, target: true, kind: true, state: true },
    }),
  ]);
  const incidents = await prisma.incident.groupBy({
    by: ["monitorId"],
    where: { organizationId, isDemo: false, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    _count: { _all: true },
  });
  const openByMonitor: Record<string, number> = {};
  incidents.forEach((i) => {
    if (i.monitorId) openByMonitor[i.monitorId] = i._count._all;
  });

  const out: Record<string, AssetLive> = {};
  for (const domain of Object.keys(wanted)) {
    const g = gsc.filter((p) => siteDomain(p.siteUrl) === domain)[0];
    const mons = monitors.filter((m) => siteDomain(m.target) === domain);
    const crawl = mons.filter((m) => m.kind === "SITE_CRAWL")[0];
    const queries = g
      ? await prisma.gscMetric.findMany({
          where: { propertyId: g.id, dimension: "query" },
          orderBy: { impressions: "desc" },
          take: 5,
          select: { key: true, impressions: true, position: true },
        })
      : [];
    out[domain] = {
      google: g ? { clicks: g.clicks28d, impressions: g.impressions28d, avgPosition: g.avgPosition, through: g.dataThrough } : null,
      analytics: mainAnalytics(ga4.filter((p) => siteDomain(p.websiteUrl) === domain)),
      pagesInSitemap: crawl ? pagesFromCrawlState(crawl.state) : null,
      checks: mons.length,
      openIncidents: mons.reduce((s, m) => s + (openByMonitor[m.id] ?? 0), 0),
      topQueries: queries.map((q) => ({ query: q.key, impressions: q.impressions, position: q.position })),
    };
  }
  return out;
}
