import { PageShell } from "@/components/layout/page-shell";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

function rankBand(pos: number) {
  if (pos <= 3) return { label: "Top 3", variant: "success" as const };
  if (pos <= 10) return { label: "Page 1", variant: "info" as const };
  if (pos <= 20) return { label: "Page 2", variant: "warning" as const };
  return { label: "Page 3+", variant: "danger" as const };
}

export default async function RankTrackingPage() {
  const { organizationId } = await requireSessionOrg();

  const keywords = await prisma.gscKeyword.findMany({
    where: { property: { organizationId } },
    include: { property: { select: { siteUrl: true } } },
    orderBy: { position: "asc" },
    take: 300,
  });

  const top3 = keywords.filter((k) => k.position <= 3).length;
  const page1 = keywords.filter((k) => k.position <= 10).length;

  return (
    <PageShell title="Rank Tracking">
      <SeoTabs />
      {keywords.length === 0 ? (
        <EmptyState
          title="Nothing tracked yet"
          description="Sync a property to populate ranked queries, ordered best-first."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Tracked</div>
              <div className="mt-1 text-2xl font-semibold">{keywords.length}</div>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Top 3</div>
              <div className="mt-1 text-2xl font-semibold">{top3}</div>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Page 1</div>
              <div className="mt-1 text-2xl font-semibold">{page1}</div>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Page 1 rate</div>
              <div className="mt-1 text-2xl font-semibold">
                {keywords.length ? Math.round((page1 / keywords.length) * 100) : 0}%
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Band</th>
                  <th className="px-4 py-3">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => {
                  const band = rankBand(k.position);
                  return (
                    <tr key={k.id} className="border-t border-card-border hover:bg-background/30">
                      <td className="px-4 py-3 font-semibold">{k.position.toFixed(1)}</td>
                      <td className="px-4 py-3">{k.query}</td>
                      <td className="px-4 py-3 text-muted">{k.property.siteUrl}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={band.label} variant={band.variant} />
                      </td>
                      <td className="px-4 py-3">{k.clicks.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}
