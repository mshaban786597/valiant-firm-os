import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { liveForDomains } from "@/lib/rank-rent/live";
import { knownDomains, ownershipLabel } from "@/lib/sites/registry";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("en-US");

const kindVariant = (kind: string | undefined) =>
  kind === "client" ? ("success" as const) : kind === "rank_rent" ? ("info" as const) : kind === "own" ? ("neutral" as const) : ("warning" as const);

export default async function SitesPage() {
  const { organizationId } = await requireSessionOrg();
  const [sites, domains] = await Promise.all([
    prisma.site.findMany({ where: { organizationId }, include: { client: { select: { id: true, businessName: true } } } }),
    knownDomains(organizationId),
  ]);
  const live = await liveForDomains(organizationId, domains);
  const byDomain: Record<string, (typeof sites)[number]> = {};
  sites.forEach((s) => (byDomain[s.domain] = s));

  const order: Record<string, number> = { client: 0, rank_rent: 1, own: 2 };
  const rows = domains
    .map((domain) => ({ domain, site: byDomain[domain] ?? null, live: live[domain] ?? null }))
    .sort((a, b) => (order[a.site?.kind ?? "zz"] ?? 9) - (order[b.site?.kind ?? "zz"] ?? 9) || a.domain.localeCompare(b.domain));

  const count = (kind: string) => rows.filter((r) => r.site?.kind === kind).length;
  const unclassified = rows.filter((r) => !r.site).length;
  const issues = rows.reduce((s, r) => s + (r.live?.openIncidents ?? 0), 0);

  return (
    <PageShell title="Websites">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Every website the app measures, and whose it is. Google and Analytics numbers are live for the last 28 days. A
        client can have more than one website.
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No website yet" description="Add a website from Monitoring to start measuring it." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <KpiCard label="Websites" value={String(rows.length)} />
            <KpiCard label="Client websites" value={String(count("client"))} />
            <KpiCard label="Rank & Rent" value={String(count("rank_rent"))} />
            <KpiCard label="Our own" value={String(count("own"))} />
            <KpiCard label="Open issues" value={String(issues)} hint={unclassified ? `${unclassified} site${unclassified === 1 ? "" : "s"} not classified` : "Across all websites"} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">Whose it is</th>
                  <th className="px-4 py-3">Google (28 days)</th>
                  <th className="px-4 py-3">Analytics (28 days)</th>
                  <th className="px-4 py-3">Site health</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ domain, site, live: l }) => (
                  <tr key={domain} className="border-t border-card-border align-top">
                    <td className="px-4 py-3">
                      <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="font-semibold hover:text-valiant">
                        {domain}
                      </a>
                      {site && site.name !== domain ? <div className="text-xs text-muted">{site.name}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={ownershipLabel(site ? { kind: site.kind, clientName: site.client?.businessName } : null)} variant={kindVariant(site?.kind)} />
                      {site?.client ? (
                        <div className="mt-1 text-xs">
                          <Link href={`/clients/${site.client.id}`} className="text-muted hover:text-valiant">
                            Open client
                          </Link>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l?.google ? (
                        <>
                          <div>
                            {num(l.google.clicks)} clicks · {num(l.google.impressions)} impressions
                          </div>
                          <div className="text-muted">Average position {l.google.avgPosition !== null ? l.google.avgPosition.toFixed(1) : "—"}</div>
                        </>
                      ) : (
                        <span className="text-muted">Search Console not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l?.analytics ? (
                        <>
                          <div>
                            {num(l.analytics.sessions)} sessions · {num(l.analytics.keyEvents)} key events
                          </div>
                          {l.analytics.properties > 1 ? <div className="text-amber-600">Largest of {l.analytics.properties} properties</div> : null}
                        </>
                      ) : (
                        <span className="text-muted">Analytics not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l && l.checks > 0 ? (
                        <>
                          <Link href="/monitoring" className={l.openIncidents ? "font-semibold text-red-600" : "text-emerald-600"}>
                            {l.openIncidents ? `${l.openIncidents} open issue${l.openIncidents === 1 ? "" : "s"}` : "No open issues"}
                          </Link>
                          <div className="text-muted">
                            {l.checks} checks{l.pagesInSitemap !== null ? ` · ${l.pagesInSitemap} pages` : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted">Not monitored</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}
