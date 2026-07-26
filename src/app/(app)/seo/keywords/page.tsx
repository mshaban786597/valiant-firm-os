import { PageShell } from "@/components/layout/page-shell";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { KeywordsTable, type KeywordRow } from "@/components/seo/keywords-table";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function SeoKeywordsPage() {
  const { organizationId } = await requireSessionOrg();

  const keywords = await prisma.gscKeyword.findMany({
    where: { property: { organizationId } },
    include: { property: { select: { siteUrl: true } } },
    orderBy: { clicks: "desc" },
    take: 500,
  });

  const rows: KeywordRow[] = keywords.map((k) => ({
    id: k.id,
    query: k.query,
    site: k.property.siteUrl,
    clicks: k.clicks,
    impressions: k.impressions,
    ctr: k.ctr,
    position: k.position,
  }));

  return (
    <PageShell title="Keyword Performance">
      <SeoTabs />
      {rows.length === 0 ? (
        <EmptyState
          title="No keyword data yet"
          description="Sync a Search Console property from the Overview tab to pull top queries."
        />
      ) : (
        <KeywordsTable rows={rows} />
      )}
    </PageShell>
  );
}
