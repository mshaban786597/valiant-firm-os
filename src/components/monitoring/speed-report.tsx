import { StatusBadge } from "@/components/ui/status-badge";
import type { PageSpeedReport, SpeedVerdict } from "@/lib/monitoring/pagespeed";

export interface SpeedRow {
  id: string;
  site: string;
  measuredAt: string | null;
  report: PageSpeedReport;
}

const VERDICT: Record<SpeedVerdict, { label: string; variant: "success" | "warning" | "danger" }> = {
  good: { label: "Fast", variant: "success" },
  needs_improvement: { label: "Could be faster", variant: "warning" },
  poor: { label: "Slow", variant: "danger" },
};

const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);

/** Page speed per site, with the reason whenever a site is not fast. */
export function SpeedReport({ rows }: { rows: SpeedRow[] }) {
  if (rows.length === 0) return null;
  const order: Record<SpeedVerdict, number> = { poor: 0, needs_improvement: 1, good: 2 };
  const sorted = rows
    .slice()
    .sort((a, b) => order[a.report.verdict] - order[b.report.verdict] || (b.report.lcpMs ?? 0) - (a.report.lcpMs ?? 0));

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Page speed and why</h2>
        <p className="text-xs text-muted">
          Google PageSpeed lab test on a simulated mid-range phone and slow 4G, so it is stricter than most real
          visits. Slow = score under 50, or the largest element takes over 4 seconds, or layout shift over 0.25.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Largest element (LCP)</th>
              <th className="px-4 py-3">Layout shift</th>
              <th className="px-4 py-3">Why</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ id, site, measuredAt, report: r }) => {
              const v = VERDICT[r.verdict];
              return (
                <tr key={id} className="border-t border-card-border align-top hover:bg-background/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{site}</div>
                    <div className="text-xs text-muted">
                      {measuredAt ? `Measured ${new Date(measuredAt).toLocaleString()}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={v.label} variant={v.variant} />
                  </td>
                  <td className="px-4 py-3 font-semibold">{r.score === null ? "—" : `${r.score}/100`}</td>
                  <td className="px-4 py-3">
                    {secs(r.lcpMs)}
                    {r.largestElement ? <div className="text-xs text-muted">{r.largestElement}</div> : null}
                  </td>
                  <td className="px-4 py-3">{r.cls === null ? "—" : r.cls}</td>
                  <td className="max-w-xl px-4 py-3 text-xs text-muted">
                    {r.verdict === "good" ? (
                      "Nothing to fix."
                    ) : (
                      <>
                        {r.mainCause ? <p className="text-foreground">{r.mainCause}</p> : null}
                        {r.reasons.length ? (
                          <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {r.reasons.slice(0, 4).map((x) => (
                              <li key={x.id}>
                                {x.title}
                                {x.detail ? `: ${x.detail}` : ""}
                                {x.savingsMs >= 100 ? ` (about ${(x.savingsMs / 1000).toFixed(1)}s faster)` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : !r.mainCause ? (
                          "Google's report lists no specific cause."
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
