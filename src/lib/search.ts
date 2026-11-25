import { getDataScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchResults {
  query: string;
  total: number;
  groups: { type: string; hits: SearchHit[] }[];
}

const SITE_KIND_LABEL: Record<string, string> = {
  client: "Client site",
  rank_rent: "Rank & Rent",
  own: "Our site",
};

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/**
 * Unified, org-scoped search across the primary entities. Every query filters
 * by organizationId so results never cross tenants. Uses case-insensitive
 * `contains` matching (portable, index-friendly for our sizes).
 */
export async function globalSearch(
  organizationId: string,
  rawQuery: string,
  perType = 8,
): Promise<SearchResults> {
  const q = rawQuery.trim();
  if (q.length < 2) {
    return { query: q, total: 0, groups: [] };
  }

  const isDemo = getDataScope().isDemo;
  const [leads, clients, deals, tasks, reports, invoices, contacts, campaigns, stores, sites, enquiries] =
    await Promise.all([
    prisma.lead.findMany({
      where: {
        organizationId,
        isDemo,
        OR: [{ businessName: ci(q) }, { email: ci(q) }, { city: ci(q) }, { niche: ci(q) }],
      },
      select: { id: true, businessName: true, city: true, niche: true },
      take: perType,
    }),
    prisma.client.findMany({
      where: {
        organizationId,
        isDemo,
        OR: [{ businessName: ci(q) }, { primaryContact: ci(q) }, { email: ci(q) }],
      },
      select: { id: true, businessName: true, status: true },
      take: perType,
    }),
    prisma.deal.findMany({
      where: {
        organizationId,
        isDemo,
        OR: [{ businessName: ci(q) }, { contactName: ci(q) }],
      },
      select: { id: true, businessName: true, stage: true },
      take: perType,
    }),
    prisma.task.findMany({
      where: { organizationId, isDemo, title: ci(q) },
      select: { id: true, title: true, status: true, clientId: true },
      take: perType,
    }),
    prisma.report.findMany({
      where: { organizationId, isDemo, OR: [{ month: ci(q) }, { reportSummary: ci(q) }] },
      select: { id: true, month: true, clientId: true },
      take: perType,
    }),
    prisma.invoice.findMany({
      where: { organizationId, OR: [{ number: ci(q) }, { notes: ci(q) }] },
      select: { id: true, number: true, status: true },
      take: perType,
    }),
    prisma.contact.findMany({
      where: { organizationId, OR: [{ name: ci(q) }, { email: ci(q) }] },
      select: { id: true, name: true, title: true },
      take: perType,
    }),
    prisma.campaign.findMany({
      where: { organizationId, name: ci(q) },
      select: { id: true, name: true, channel: true },
      take: perType,
    }),
    prisma.ecommerceStore.findMany({
      where: { organizationId, name: ci(q) },
      select: { id: true, name: true, platform: true },
      take: perType,
    }),
    prisma.site.findMany({
      where: { organizationId, OR: [{ domain: ci(q) }, { name: ci(q) }] },
      select: { id: true, domain: true, name: true, kind: true },
      take: perType,
    }),
    prisma.siteLead.findMany({
      where: {
        organizationId,
        isTest: false,
        OR: [{ name: ci(q) }, { email: ci(q) }, { phone: ci(q) }, { message: ci(q) }],
      },
      select: { id: true, name: true, email: true, phone: true, site: { select: { domain: true } } },
      orderBy: { receivedAt: "desc" },
      take: perType,
    }),
  ]);

  const groups: SearchResults["groups"] = [];

  if (clients.length)
    groups.push({
      type: "Clients",
      hits: clients.map((c) => ({
        type: "Client",
        id: c.id,
        title: c.businessName,
        subtitle: c.status,
        href: `/clients/${c.id}`,
      })),
    });
  if (sites.length)
    groups.push({
      type: "Websites",
      hits: sites.map((w) => ({
        type: "Website",
        id: w.id,
        title: w.domain,
        subtitle: SITE_KIND_LABEL[w.kind] ?? w.kind,
        href: "/sites",
      })),
    });
  if (enquiries.length)
    groups.push({
      type: "Leads Inbox",
      hits: enquiries.map((e) => ({
        type: "Enquiry",
        id: e.id,
        title: e.name ?? e.email ?? e.phone ?? "Website enquiry",
        subtitle: e.site.domain,
        href: "/inbox",
      })),
    });

  if (leads.length)
    groups.push({
      type: "Leads",
      hits: leads.map((l) => ({
        type: "Lead",
        id: l.id,
        title: l.businessName,
        subtitle: `${l.niche} · ${l.city}`,
        href: `/leads/${l.id}`,
      })),
    });
  if (deals.length)
    groups.push({
      type: "Deals",
      hits: deals.map((d) => ({
        type: "Deal",
        id: d.id,
        title: d.businessName,
        subtitle: d.stage,
        href: `/pipeline`,
      })),
    });
  if (tasks.length)
    groups.push({
      type: "Tasks",
      hits: tasks.map((t) => ({
        type: "Task",
        id: t.id,
        title: t.title,
        subtitle: t.status,
        href: `/clients/${t.clientId}`,
      })),
    });
  if (reports.length)
    groups.push({
      type: "Reports",
      hits: reports.map((r) => ({
        type: "Report",
        id: r.id,
        title: `Report — ${r.month}`,
        href: `/clients/${r.clientId}`,
      })),
    });
  if (invoices.length)
    groups.push({
      type: "Invoices",
      hits: invoices.map((i) => ({
        type: "Invoice",
        id: i.id,
        title: i.number ?? `Invoice ${i.id.slice(0, 8)}`,
        subtitle: i.status,
        href: `/billing`,
      })),
    });

  if (contacts.length)
    groups.push({
      type: "Contacts",
      hits: contacts.map((c) => ({
        type: "Contact",
        id: c.id,
        title: c.name,
        subtitle: c.title ?? undefined,
        href: `/contacts`,
      })),
    });
  if (campaigns.length)
    groups.push({
      type: "Campaigns",
      hits: campaigns.map((c) => ({
        type: "Campaign",
        id: c.id,
        title: c.name,
        subtitle: c.channel,
        href: `/campaigns`,
      })),
    });
  if (stores.length)
    groups.push({
      type: "Ecommerce",
      hits: stores.map((s) => ({
        type: "Store",
        id: s.id,
        title: s.name,
        subtitle: s.platform,
        href: `/ecommerce/${s.id}`,
      })),
    });

  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return { query: q, total, groups };
}
