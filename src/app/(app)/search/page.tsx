import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchBox } from "@/components/search/search-box";
import { globalSearch } from "@/lib/search";
import { requireSessionOrg } from "@/lib/session-org";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { organizationId } = await requireSessionOrg();
  const q = searchParams.q ?? "";
  const results = q ? await globalSearch(organizationId, q) : null;

  return (
    <PageShell title="Search">
      <SearchBox initialQuery={q} />

      {!results ? (
        <EmptyState
          title="Search everything"
          description="Find leads, clients, deals, tasks, reports, and invoices across your organization."
        />
      ) : results.total === 0 ? (
        <EmptyState
          title={`No results for “${results.query}”`}
          description="Try a different name, email, or keyword."
        />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted">
            {results.total} result{results.total === 1 ? "" : "s"} for “{results.query}”
          </p>
          {results.groups.map((group) => (
            <div key={group.type}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {group.type}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
                {group.hits.map((hit) => (
                  <Link
                    key={`${hit.type}-${hit.id}`}
                    href={hit.href}
                    className="flex items-center justify-between border-b border-card-border px-4 py-3 text-sm last:border-b-0 hover:bg-background/40"
                  >
                    <span className="font-medium">{hit.title}</span>
                    {hit.subtitle ? (
                      <span className="text-xs text-muted">{hit.subtitle}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
