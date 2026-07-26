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

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/**
 * Unified, org-scoped search across the primary entities. Every query filters
 * by organizationId so results never cross tenants. Uses case-insensitive
 * `contains` matching (portable, index-friendly for our sizes).
 */
export async function globalSearch(
  organizationId: string,
  rawQuery: string,
): Promise<SearchResults> {
  const q = rawQuery.trim();
  if (q.length < 2) {
    return { query: q, total: 0, groups: [] };
  }

  const [leads, clients, deals, tasks, reports, invoices] = await Promise.all([
    prisma.lead.findMany({
      where: {
        organizationId,
        OR: [{ businessName: ci(q) }, { email: ci(q) }, { city: ci(q) }, { niche: ci(q) }],
      },
      select: { id: true, businessName: true, city: true, niche: true },
      take: 8,
    }),
    prisma.client.findMany({
      where: {
        organizationId,
        OR: [{ businessName: ci(q) }, { primaryContact: ci(q) }, { email: ci(q) }],
      },
      select: { id: true, businessName: true, status: true },
      take: 8,
    }),
    prisma.deal.findMany({
      where: {
        organizationId,
        OR: [{ businessName: ci(q) }, { contactName: ci(q) }],
      },
      select: { id: true, businessName: true, stage: true },
      take: 8,
    }),
    prisma.task.findMany({
      where: { organizationId, title: ci(q) },
      select: { id: true, title: true, status: true, clientId: true },
      take: 8,
    }),
    prisma.report.findMany({
      where: { organizationId, OR: [{ month: ci(q) }, { reportSummary: ci(q) }] },
      select: { id: true, month: true, clientId: true },
      take: 8,
    }),
    prisma.invoice.findMany({
      where: { organizationId, OR: [{ number: ci(q) }, { notes: ci(q) }] },
      select: { id: true, number: true, status: true },
      take: 8,
    }),
  ]);

  const groups: SearchResults["groups"] = [];

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

  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return { query: q, total, groups };
}
