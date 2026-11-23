import { KpiCard } from "@/components/dashboard/kpi-card";

export interface VisibilitySite {
  domain: string;
  provider: string;
  location: string | null;
  observedAt: string;
  overview: {
    organicKeywords?: number;
    estimatedMonthlyTraffic?: number;
    domainAuthority?: number;
    backlinks?: number;
    referringDomains?: number;
  } | null;
  keywords: { keyword: string; position: number; volume: number; url?: string; intent?: string }[];
}

const PROVIDER_LABEL: Record<string, string> = { ubersuggest: "Ubersuggest" };
const num = (n: number | undefined) => (typeof n === "number" ? n.toLocaleString() : "—");

/**
 * Third-party visibility estimates, kept apart from observed Search Console
 * data. Always shows provider, location and the date the snapshot was taken.
 */
export function VisibilityEstimates({ sites }: { sites: VisibilitySite[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Search visibility estimates</h2>
        <p className="text-xs text-muted">
          Estimated by a third-party tool from its own keyword database. These are not Search Console
          figures and can differ from them.
        </p>
      </div>
      {sites.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
          No estimates imported yet.
        </div>
      ) : (
        sites.map((s) => (
          <div key={s.domain} className="space-y-3 rounded-xl border border-card-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">{s.domain}</div>
              <div className="text-xs text-muted">
                {PROVIDER_LABEL[s.provider] ?? s.provider}
                {s.location ? ` · ${s.location}` : ""} · snapshot {new Date(s.observedAt).toLocaleDateString()}
              </div>
            </div>
            {s.overview ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <KpiCard label="Domain authority" value={num(s.overview.domainAuthority)} />
                <KpiCard label="Backlinks" value={num(s.overview.backlinks)} />
                <KpiCard label="Referring domains" value={num(s.overview.referringDomains)} />
                <KpiCard label="Ranked keywords" value={num(s.overview.organicKeywords)} />
                <KpiCard label="Est. monthly visits" value={num(s.overview.estimatedMonthlyTraffic)} />
              </div>
            ) : null}
            {s.keywords.length ? (
              <div className="overflow-x-auto rounded-lg border border-card-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Keyword</th>
                      <th className="px-3 py-2">Position</th>
                      <th className="px-3 py-2">Monthly searches</th>
                      <th className="px-3 py-2">Ranking page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.keywords.map((k) => (
                      <tr key={k.keyword} className="border-t border-card-border">
                        <td className="px-3 py-2 font-medium">{k.keyword}</td>
                        <td className="px-3 py-2">{k.position}</td>
                        <td className="px-3 py-2">{num(k.volume)}</td>
                        <td className="break-all px-3 py-2 text-xs text-muted">
                          {k.url ? k.url.replace(/^https?:\/\/[^/]+/, "") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted">The provider lists no ranked keywords for this domain.</p>
            )}
          </div>
        ))
      )}
    </section>
  );
}
