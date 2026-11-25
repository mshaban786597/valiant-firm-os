import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/charts/dashboard-charts";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { FindPropertiesButton, SyncPropertyButton } from "@/components/analytics/ga4-actions";
import { Ga4Trend } from "@/components/analytics/ga4-trend";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { GA4_STATE_COPY, changePct, type Ga4SyncState } from "@/lib/integrations/ga4";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("en-US");
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

function Change({ current, previous }: { current: number; previous: number | null }) {
  const c = changePct(current, previous);
  if (c === null) return <span className="text-xs text-muted">no earlier data</span>;
  const up = c >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {up ? "+" : ""}
      {c.toFixed(0)}% vs previous 28 days
    </span>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: { key: string; sessions: number; users: number; keyEvents: number }[]; total: number }) {
  return (
    <section className="space-y-2">
      <h3 className="section-title">{title}</h3>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-card-border bg-card p-4 text-xs text-muted">No sessions in this period.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">{title.replace(/^Top /, "")}</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Share</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2 text-right">Key events</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-card-border">
                  <td className="max-w-[320px] truncate px-3 py-2" title={r.key}>
                    {r.key}
                  </td>
                  <td className="px-3 py-2 text-right">{num(r.sessions)}</td>
                  <td className="px-3 py-2 text-right text-muted">{total > 0 ? `${((r.sessions / total) * 100).toFixed(0)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right">{num(r.users)}</td>
                  <td className="px-3 py-2 text-right">{num(r.keyEvents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AnalyticsPage(props: { searchParams?: Promise<{ p?: string }> }) {
  const searchParams = await props.searchParams;
  const { organizationId } = await requireSessionOrg();
  const properties = await prisma.ga4Property.findMany({
    where: { organizationId },
    include: { client: { select: { businessName: true } } },
    orderBy: [{ sessions28d: "desc" }, { displayName: "asc" }],
  });

  const synced = properties.filter((p) => p.syncState === "ok");
  const selected = properties.filter((p) => p.id === searchParams?.p)[0] ?? synced[0] ?? properties[0] ?? null;
  const metrics =
    selected && selected.periodStart && selected.periodEnd
      ? await prisma.ga4Metric.findMany({
          where: { ga4PropertyId: selected.id, periodStart: selected.periodStart, periodEnd: selected.periodEnd },
          orderBy: { sessions: "desc" },
        })
      : [];
  const of = (dimension: string) => metrics.filter((m) => m.dimension === dimension);
  const trend = of("date")
    .map((m) => ({ date: m.key, sessions: m.sessions, users: m.users }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const totals = synced.reduce(
    (acc, p) => ({ sessions: acc.sessions + p.sessions28d, users: acc.users + p.users28d, keyEvents: acc.keyEvents + p.keyEvents28d }),
    { sessions: 0, users: 0, keyEvents: 0 },
  );

  // The same website measured by more than one property splits (or doubles) its numbers.
  const byDomain: Record<string, string[]> = {};
  properties.forEach((p) => {
    const d = (p.websiteUrl ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    if (d) (byDomain[d] = byDomain[d] ?? []).push(p.displayName);
  });
  const duplicated = Object.keys(byDomain)
    .filter((d) => byDomain[d]!.length > 1)
    .sort();

  return (
    <PageShell title="Google Analytics" actions={<FindPropertiesButton />}>
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Numbers come straight from Google Analytics 4 for the last 28 complete days. A property appears here once the
        service account has the Viewer role in Analytics. If a sync fails, the previous numbers stay as they were.
      </div>

      {properties.length === 0 ? (
        <EmptyState
          title="No Analytics property connected"
          description="Add the service-account email as a Viewer in Analytics > Admin > Account access management, then press Find properties."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Properties connected" value={`${synced.length} of ${properties.length}`} hint="Synced successfully" />
            <KpiCard
              label="Sessions (all properties)"
              value={num(totals.sessions)}
              hint={duplicated.length ? "Last 28 days · some sites counted in two properties" : "Last 28 days"}
            />
            <KpiCard label="Users (all properties)" value={num(totals.users)} hint="Counted per property" />
            <KpiCard label="Key events (all properties)" value={num(totals.keyEvents)} hint="Conversions set up in GA4" />
          </div>

          {duplicated.length ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <div className="font-semibold">
                {duplicated.length} website{duplicated.length === 1 ? " is" : "s are"} measured by two Analytics properties
              </div>
              <p className="mt-1 text-xs text-muted">
                {duplicated.join(", ")}. When a site sends data to two properties, each one shows only part of the picture
                and the totals above count those visits in both. Keep one property per site and remove the other tag.
              </p>
            </div>
          ) : null}

          <section className="space-y-2">
            <h2 className="section-title">Properties</h2>
            <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Property</th>
                    <th className="px-4 py-3 text-right">Sessions</th>
                    <th className="px-4 py-3 text-right">Users</th>
                    <th className="px-4 py-3 text-right">Key events</th>
                    <th className="px-4 py-3 text-right">Engagement</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => {
                    const ok = p.syncState === "ok";
                    return (
                      <tr key={p.id} className={`border-t border-card-border ${selected?.id === p.id ? "bg-background/40" : ""}`}>
                        <td className="px-4 py-3">
                          <Link href={`/analytics?p=${p.id}`} className="font-semibold hover:text-valiant">
                            {p.displayName}
                          </Link>
                          <div className="text-xs text-muted">
                            {p.websiteUrl ? p.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "No web stream"} · ID {p.propertyId}
                            {p.client ? ` · ${p.client.businessName}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {ok ? num(p.sessions28d) : "—"}
                          {ok ? (
                            <div>
                              <Change current={p.sessions28d} previous={p.prevSessions28d} />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">{ok ? num(p.users28d) : "—"}</td>
                        <td className="px-4 py-3 text-right">{ok ? num(p.keyEvents28d) : "—"}</td>
                        <td className="px-4 py-3 text-right">{ok ? pct(p.engagementRate) : "—"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={ok ? "Synced" : p.syncState === "never" ? "Not synced yet" : "Sync failed"}
                            variant={ok ? "success" : p.syncState === "never" ? "neutral" : "danger"}
                          />
                          <div className="mt-1 max-w-[260px] text-xs text-muted">
                            {ok
                              ? `Data to ${day(p.periodEnd)}`
                              : p.syncState === "never"
                                ? "Press Sync now"
                                : `${GA4_STATE_COPY[p.syncState as Ga4SyncState] ?? p.syncState}${p.lastError ? ` (${p.lastError})` : ""}`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <SyncPropertyButton id={p.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selected && selected.syncState === "ok" ? (
            <section className="space-y-4">
              <h2 className="section-title">
                {selected.displayName}{" "}
                <span className="font-normal text-muted">
                  · {day(selected.periodStart)} to {day(selected.periodEnd)}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <KpiCard label="Sessions" value={num(selected.sessions28d)} />
                <KpiCard label="Users" value={num(selected.users28d)} hint={`${num(selected.newUsers28d)} new`} />
                <KpiCard label="Page views" value={num(selected.views28d)} />
                <KpiCard label="Key events" value={num(selected.keyEvents28d)} />
                <KpiCard
                  label="Engagement rate"
                  value={pct(selected.engagementRate)}
                  hint={selected.avgEngagementSec !== null ? `${Math.round(selected.avgEngagementSec)}s per user` : undefined}
                />
              </div>
              {selected.keyEvents28d === 0 ? (
                <p className="text-xs text-muted">
                  This property recorded no key events in the period. Either no conversion happened, or no event is marked
                  as a key event in GA4 (Admin &gt; Data display &gt; Key events), so leads are not being counted.
                </p>
              ) : null}
              <ChartCard title="Sessions per day">
                {trend.length ? <Ga4Trend data={trend} /> : <div className="pt-24 text-center text-sm text-muted">No sessions in this period.</div>}
              </ChartCard>
              <div className="grid gap-4 xl:grid-cols-2">
                <Breakdown title="Channels" rows={of("channel")} total={selected.sessions28d} />
                <Breakdown title="Devices" rows={of("device")} total={selected.sessions28d} />
                <Breakdown title="Top sources" rows={of("source").slice(0, 12)} total={selected.sessions28d} />
                <Breakdown title="Top landing pages" rows={of("landing_page").slice(0, 12)} total={selected.sessions28d} />
              </div>
            </section>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
