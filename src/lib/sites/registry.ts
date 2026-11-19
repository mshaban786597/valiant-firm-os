import { prisma } from "@/lib/prisma";
import { linkSiteToClient, siteDomain, type LinkSiteResult } from "@/lib/clients/link-site";

export const SITE_KINDS = ["client", "rank_rent", "own"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  client: "Client website",
  rank_rent: "Rank & Rent",
  own: "Our own website",
};

export function isSiteKind(v: unknown): v is SiteKind {
  return typeof v === "string" && (SITE_KINDS as readonly string[]).indexOf(v) !== -1;
}

/** How a site's ownership reads in a table cell. */
export function ownershipLabel(site: { kind: string; clientName?: string | null } | null | undefined): string {
  if (!site) return "Not classified";
  if (site.kind === "client") return site.clientName ? `Client: ${site.clientName}` : "Client (not linked)";
  return isSiteKind(site.kind) ? SITE_KIND_LABEL[site.kind] : "Not classified";
}

export interface SetSiteResult {
  siteId: string;
  created: boolean;
  linked: LinkSiteResult | null;
  released: number;
}

/**
 * Record whose a website is. A client website gets its checks, Search Console,
 * Analytics and open incidents attached to that client. A rank-and-rent or own
 * website is detached from any client, since it is not client work.
 */
export async function setSite(input: {
  organizationId: string;
  domain: string;
  name: string;
  kind: SiteKind;
  clientId?: string | null;
}): Promise<SetSiteResult> {
  const domain = siteDomain(input.domain);
  if (!domain) throw new Error("Not a valid domain");
  if (input.kind === "client" && !input.clientId) throw new Error("A client website needs its client");
  const clientId = input.kind === "client" ? input.clientId! : null;

  const existing = await prisma.site.findUnique({
    where: { organizationId_domain: { organizationId: input.organizationId, domain } },
    select: { id: true },
  });
  const site = existing
    ? await prisma.site.update({ where: { id: existing.id }, data: { name: input.name, kind: input.kind, clientId } })
    : await prisma.site.create({ data: { organizationId: input.organizationId, domain, name: input.name, kind: input.kind, clientId } });

  if (clientId) {
    const linked = await linkSiteToClient({ organizationId: input.organizationId, clientId, websiteUrl: domain });
    return { siteId: site.id, created: !existing, linked, released: 0 };
  }

  // Not client work: make sure nothing of this site is filed under a client.
  let released = 0;
  const scoped = { organizationId: input.organizationId };
  const monitors = (
    await prisma.monitor.findMany({ where: { ...scoped, isDemo: false, clientId: { not: null } }, select: { id: true, target: true } })
  ).filter((m) => siteDomain(m.target) === domain);
  for (const m of monitors) {
    await prisma.monitor.update({ where: { id: m.id }, data: { clientId: null } });
    released += 1;
  }
  const gsc = (await prisma.gscProperty.findMany({ where: { ...scoped, clientId: { not: null } }, select: { id: true, siteUrl: true } })).filter(
    (p) => siteDomain(p.siteUrl) === domain,
  );
  for (const p of gsc) {
    await prisma.gscProperty.update({ where: { id: p.id }, data: { clientId: null } });
    released += 1;
  }
  const ga4 = (await prisma.ga4Property.findMany({ where: { ...scoped, clientId: { not: null } }, select: { id: true, websiteUrl: true } })).filter(
    (p) => siteDomain(p.websiteUrl) === domain,
  );
  for (const p of ga4) {
    await prisma.ga4Property.update({ where: { id: p.id }, data: { clientId: null } });
    released += 1;
  }
  return { siteId: site.id, created: !existing, linked: null, released };
}

/** Every domain the app measures in any way, registered or not. */
export async function knownDomains(organizationId: string): Promise<string[]> {
  const [sites, monitors, gsc, ga4, assets] = await Promise.all([
    prisma.site.findMany({ where: { organizationId }, select: { domain: true } }),
    prisma.monitor.findMany({ where: { organizationId, isDemo: false }, select: { target: true }, distinct: ["target"] }),
    prisma.gscProperty.findMany({ where: { organizationId, dataSource: "live" }, select: { siteUrl: true } }),
    prisma.ga4Property.findMany({ where: { organizationId }, select: { websiteUrl: true } }),
    prisma.rankRentAsset.findMany({ where: { organizationId }, select: { domain: true } }),
  ]);
  const seen: Record<string, true> = {};
  const add = (v: string | null | undefined) => {
    const d = siteDomain(v);
    if (d) seen[d] = true;
  };
  sites.forEach((s) => add(s.domain));
  monitors.forEach((m) => add(m.target));
  gsc.forEach((p) => add(p.siteUrl));
  ga4.forEach((p) => add(p.websiteUrl));
  assets.forEach((a) => add(a.domain));
  return Object.keys(seen).sort();
}
