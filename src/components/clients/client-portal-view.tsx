import { formatCurrency } from "@/lib/utils";

export type PortalData = {
  clientName: string;
  status: string;
  healthScore: number | null;
  monthlyValue: number | null;
  gbp: { rating: number | null; reviews: number; posts: number } | null;
  seo: { clicks: number; impressions: number; avgPosition: number | null } | null;
  topKeywords: { query: string; position: number; clicks: number }[];
  latestReport: { title: string; summary: string | null } | null;
};

/**
 * Read-only, client-facing metrics view. Rendered both in the agency-internal
 * preview and on the public token-gated portal page. Contains no interactive
 * controls or write actions by design.
 */
export function ClientPortalView({ data }: { data: PortalData }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-card-border bg-card p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Client portal
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{data.clientName}</h1>
        <p className="mt-1 text-sm text-muted">
          Engagement status: <span className="font-medium text-foreground">{data.status}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Health score" value={data.healthScore != null ? `${data.healthScore}/100` : "—"} />
        <Tile label="Monthly investment" value={formatCurrency(data.monthlyValue)} />
        <Tile
          label="GBP rating"
          value={data.gbp?.rating != null ? `★ ${data.gbp.rating.toFixed(1)}` : "—"}
          hint={data.gbp ? `${data.gbp.reviews} reviews` : undefined}
        />
      </div>

      {data.seo ? (
        <Section title="Search performance (last 28 days)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile label="Clicks" value={data.seo.clicks.toLocaleString()} />
            <Tile label="Impressions" value={data.seo.impressions.toLocaleString()} />
            <Tile
              label="Avg position"
              value={data.seo.avgPosition != null ? data.seo.avgPosition.toFixed(1) : "—"}
            />
          </div>
        </Section>
      ) : null}

      {data.topKeywords.length > 0 ? (
        <Section title="Top keywords">
          <div className="overflow-hidden rounded-xl border border-card-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">Query</th>
                  <th className="px-4 py-2.5">Position</th>
                  <th className="px-4 py-2.5">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {data.topKeywords.map((k) => (
                  <tr key={k.query} className="border-t border-card-border">
                    <td className="px-4 py-2.5 font-medium">{k.query}</td>
                    <td className="px-4 py-2.5">{k.position.toFixed(1)}</td>
                    <td className="px-4 py-2.5">{k.clicks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {data.latestReport ? (
        <Section title="Latest report">
          <div className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold">{data.latestReport.title}</h3>
            {data.latestReport.summary ? (
              <p className="mt-2 whitespace-pre-line text-sm text-muted">
                {data.latestReport.summary}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">Summary pending.</p>
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}
