import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ContactsWorkspace, type ContactRow } from "@/components/crm/contacts-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function ContactsPage() {
  const { organizationId } = await requireSessionOrg();

  const [contacts, clients] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId },
      include: { client: { select: { businessName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  const rows: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    title: c.title,
    clientName: c.client?.businessName ?? null,
    tags: c.tags,
  }));

  const linked = contacts.filter((c) => c.clientId).length;

  return (
    <PageShell title="Contacts">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Contacts" value={String(contacts.length)} />
        <KpiCard label="Linked to a client" value={String(linked)} />
        <KpiCard label="Unlinked" value={String(contacts.length - linked)} />
      </div>
      <ContactsWorkspace contacts={rows} clients={clients} />
    </PageShell>
  );
}
