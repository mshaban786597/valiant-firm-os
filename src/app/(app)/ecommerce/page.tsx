import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EcommerceWorkspace, type StoreRow } from "@/components/ecommerce/ecommerce-workspace";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function EcommercePage() {
  const { organizationId } = await requireSessionOrg();

  const [stores, clients, metricAgg] = await Promise.all([
    prisma.ecommerceStore.findMany({
      where: { organizationId },
      include: {
        client: { select: { businessName: true } },
        _count: { select: { products: true, orders: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
    prisma.ecommerceMetric.aggregate({
      where: { organizationId },
      _sum: { revenueCents: true, orders: true, units: true },
      _avg: { conversionRate: true },
    }),
  ]);

  const rows: StoreRow[] = stores.map((s) => ({
    id: s.id,
    name: s.name,
    platform: s.platform,
    clientName: s.client?.businessName ?? null,
    status: s.status,
    productCount: s._count.products,
    orderCount: s._count.orders,
    lastSyncAt: s.lastSyncAt ? s.lastSyncAt.toISOString() : null,
  }));

  const revenue = metricAgg._sum.revenueCents ?? 0;
  const orders = metricAgg._sum.orders ?? 0;
  const conv = metricAgg._avg.conversionRate ?? 0;

  return (
    <PageShell title="Ecommerce">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Stores" value={String(stores.length)} hint="Amazon · eBay · Etsy · Shopify …" />
        <KpiCard label="Revenue (30d)" value={formatCents(revenue)} />
        <KpiCard label="Orders (30d)" value={orders.toLocaleString()} />
        <KpiCard label="Avg conversion" value={`${conv.toFixed(2)}%`} />
      </div>
      <EcommerceWorkspace stores={rows} clients={clients} />
    </PageShell>
  );
}
