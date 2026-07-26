import { InvoiceStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  BillingWorkspace,
  type InvoiceRow,
} from "@/components/billing/billing-workspace";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function BillingPage() {
  const { organizationId } = await requireSessionOrg();

  const [invoices, clients] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId },
      include: {
        client: { select: { businessName: true } },
        _count: { select: { lineItems: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    clientName: inv.client?.businessName ?? null,
    status: inv.status,
    totalCents: inv.totalCents,
    currency: inv.currency,
    dueAt: inv.dueAt ? inv.dueAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
    lineItemCount: inv._count.lineItems,
  }));

  const outstandingCents = invoices
    .filter((i) => i.status === InvoiceStatus.Open)
    .reduce((s, i) => s + i.totalCents, 0);
  const paidCents = invoices
    .filter((i) => i.status === InvoiceStatus.Paid)
    .reduce((s, i) => s + i.totalCents, 0);
  const draftCount = invoices.filter((i) => i.status === InvoiceStatus.Draft).length;

  return (
    <PageShell title="Billing & Invoicing">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Outstanding" value={formatCents(outstandingCents)} hint="Open invoices" />
        <KpiCard label="Collected" value={formatCents(paidCents)} hint="Paid invoices" />
        <KpiCard label="Drafts" value={String(draftCount)} hint="Not yet sent" />
        <KpiCard label="Invoices" value={String(invoices.length)} hint="Total this org" />
      </div>
      <BillingWorkspace invoices={rows} clients={clients} />
    </PageShell>
  );
}
