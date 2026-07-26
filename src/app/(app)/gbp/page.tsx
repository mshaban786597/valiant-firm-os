import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { GbpWorkspace, type GbpRow } from "@/components/gbp/gbp-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function GbpPage() {
  const { organizationId } = await requireSessionOrg();

  const [locations, clients] = await Promise.all([
    prisma.gbpLocation.findMany({
      where: { organizationId },
      include: { client: { select: { businessName: true } } },
      orderBy: { businessName: "asc" },
      take: 300,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  const rows: GbpRow[] = locations.map((l) => ({
    id: l.id,
    gbpId: l.gbpId,
    businessName: l.businessName,
    category: l.category,
    clientName: l.client?.businessName ?? null,
    rating: l.rating,
    reviewCount: l.reviewCount,
    postsLast30Days: l.postsLast30Days,
    lastSyncAt: l.lastSyncAt ? l.lastSyncAt.toISOString() : null,
  }));

  const totalReviews = locations.reduce((s, l) => s + l.reviewCount, 0);
  const rated = locations.filter((l) => l.rating != null);
  const avgRating = rated.length
    ? rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length
    : 0;
  const totalPosts = locations.reduce((s, l) => s + l.postsLast30Days, 0);

  return (
    <PageShell title="Google Business Profiles">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Locations" value={String(locations.length)} />
        <KpiCard label="Avg rating" value={avgRating ? `★ ${avgRating.toFixed(2)}` : "—"} />
        <KpiCard label="Total reviews" value={String(totalReviews)} />
        <KpiCard label="Posts (30d)" value={String(totalPosts)} hint="Across all locations" />
      </div>
      <GbpWorkspace locations={rows} clients={clients} />
    </PageShell>
  );
}
