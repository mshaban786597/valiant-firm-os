import { PageShell } from "@/components/layout/page-shell";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function SeoKeywordsPage() {
  const { organizationId } = await requireSessionOrg();

  const keywords = await prisma.gscKeyword.findMany({
    where: { property: { organizationId } },
    include: { property: { select: { siteUrl: true } } },
    orderBy: { clicks: "desc" },
    take: 300,
  });

  return (
    <PageShell title="Keyword Performance">
      <SeoTabs />
      {keywords.length === 0 ? (
        <EmptyState
          title="No keyword data yet"
          description="Sync a Search Console property from the Overview tab to pull top queries."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Query</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Impressions</th>
                <th className="px-4 py-3">CTR</th>
                <th className="px-4 py-3">Position</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((k) => (
                <tr key={k.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3 font-medium">{k.query}</td>
                  <td className="px-4 py-3 text-muted">{k.property.siteUrl}</td>
                  <td className="px-4 py-3">{k.clicks.toLocaleString()}</td>
                  <td className="px-4 py-3">{k.impressions.toLocaleString()}</td>
                  <td className="px-4 py-3">{k.ctr.toFixed(1)}%</td>
                  <td className="px-4 py-3">{k.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
