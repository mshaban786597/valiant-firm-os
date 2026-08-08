import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function StoreDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organizationId } = await requireSessionOrg();

  const store = await prisma.ecommerceStore.findFirst({
    where: { id: params.id, organizationId },
    include: {
      client: { select: { id: true, businessName: true } },
      products: { orderBy: { priceCents: "desc" }, take: 100 },
      orders: { orderBy: { placedAt: "desc" }, take: 25 },
      metrics: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  if (!store) notFound();

  const revenue = store.metrics.reduce((s, m) => s + m.revenueCents, 0);
  const orders = store.metrics.reduce((s, m) => s + m.orders, 0);
  const units = store.metrics.reduce((s, m) => s + m.units, 0);
  const aov = orders ? Math.round(revenue / orders) : 0;

  return (
    <PageShell title={store.name}>
      <div className="flex items-center justify-between">
        <Link href="/ecommerce" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to stores
        </Link>
        <StatusBadge
          label={store.status}
          variant={store.status === "connected" ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue (30d)" value={formatCents(revenue, store.currency)} />
        <KpiCard label="Orders (30d)" value={orders.toLocaleString()} />
        <KpiCard label="Units (30d)" value={units.toLocaleString()} />
        <KpiCard label="Avg order value" value={formatCents(aov, store.currency)} />
      </div>

      <div className="rounded-xl border border-card-border bg-card p-4 text-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div><span className="text-muted">Platform:</span> {store.platform}</div>
          <div><span className="text-muted">Client:</span> {store.client ? (
            <Link href={`/clients/${store.client.id}`} className="text-valiant hover:underline">{store.client.businessName}</Link>
          ) : "Unlinked"}</div>
          <div><span className="text-muted">Last sync:</span> {store.lastSyncAt ? store.lastSyncAt.toLocaleString() : "Never"}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Top products</h2>
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Inventory</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {store.products.slice(0, 12).map((p) => (
                  <tr key={p.id} className="border-t border-card-border">
                    <td className="px-3 py-2">{p.title}<div className="text-[11px] text-muted">{p.sku}</div></td>
                    <td className="px-3 py-2">{formatCents(p.priceCents, store.currency)}</td>
                    <td className="px-3 py-2">{p.inventory}</td>
                    <td className="px-3 py-2 text-muted">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Recent orders</h2>
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {store.orders.slice(0, 12).map((o) => (
                  <tr key={o.id} className="border-t border-card-border">
                    <td className="px-3 py-2 text-muted">{o.placedAt.toLocaleDateString()}</td>
                    <td className="px-3 py-2">{o.itemCount}</td>
                    <td className="px-3 py-2 font-medium">{formatCents(o.totalCents, store.currency)}</td>
                    <td className="px-3 py-2 text-muted">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
