import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { FindProfilesButton, SyncProfileButton } from "@/components/gbp/gbp-actions";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { GBP_STATE_COPY, type GbpSyncState } from "@/lib/integrations/gbp";
import { parseServiceAccount } from "@/lib/integrations/google-auth";

export const dynamic = "force-dynamic";

const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function GbpPage() {
  const { organizationId } = await requireSessionOrg();
  const locations = await prisma.gbpLocation.findMany({
    where: { organizationId },
    include: { client: { select: { businessName: true } } },
    orderBy: { businessName: "asc" },
    take: 300,
  });

  const synced = locations.filter((l) => l.syncState === "ok");
  const sum = (pick: (l: (typeof locations)[number]) => number | null) => synced.reduce((s, l) => s + (pick(l) ?? 0), 0);
  const rated = locations.filter((l) => l.rating !== null);
  const blocked = locations.filter((l) => l.syncState === "not_approved" || l.syncState === "api_disabled")[0];
  const serviceEmail = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)?.client_email ?? null;

  return (
    <PageShell title="Google Business Profiles" actions={<FindProfilesButton />}>
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Profile activity comes straight from Google for the last 28 days (ending 3 days ago, because Google&apos;s latest
        days are incomplete). A profile appears here once the service account is a Manager on it. If a sync fails, the
        previous numbers stay as they were.
      </div>

      {blocked ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="font-semibold">Google is not letting this project read Business Profiles yet</div>
          <p className="mt-1 text-xs text-muted">{GBP_STATE_COPY[blocked.syncState as GbpSyncState]}</p>
        </div>
      ) : null}

      {locations.length === 0 ? (
        <EmptyState
          title="No Business Profile connected"
          description={`Three things are needed: (1) the Business Profile APIs enabled in the Google Cloud project, (2) Google's approval of the project for those APIs, (3) ${
            serviceEmail ?? "the service-account email"
          } added as a Manager on each profile. Then press Find profiles; it reports exactly which step is missing.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <KpiCard label="Profiles" value={`${synced.length} of ${locations.length}`} hint="Synced successfully" />
            <KpiCard label="Views" value={synced.length ? num(sum((l) => (l.searchViews28d ?? 0) + (l.mapsViews28d ?? 0))) : "—"} hint="Search + Maps, 28 days" />
            <KpiCard label="Calls" value={synced.length ? num(sum((l) => l.calls28d)) : "—"} hint="Taps on Call" />
            <KpiCard label="Website clicks" value={synced.length ? num(sum((l) => l.websiteClicks28d)) : "—"} />
            <KpiCard
              label="Average rating"
              value={rated.length ? `★ ${(rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length).toFixed(2)}` : "—"}
              hint={rated.length ? `${rated.length} profile${rated.length === 1 ? "" : "s"} with a rating` : "No rating read yet"}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Profile</th>
                  <th className="px-4 py-3">Views (28 days)</th>
                  <th className="px-4 py-3">Actions taken</th>
                  <th className="px-4 py-3">Reviews</th>
                  <th className="px-4 py-3">Profile gaps</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => {
                  const ok = l.syncState === "ok";
                  const live = l.dataSource === "live";
                  return (
                    <tr key={l.id} className="border-t border-card-border align-top">
                      <td className="px-4 py-3">
                        {l.mapsUri ? (
                          <a href={l.mapsUri} target="_blank" rel="noreferrer" className="font-semibold hover:text-valiant">
                            {l.businessName}
                          </a>
                        ) : (
                          <span className="font-semibold">{l.businessName}</span>
                        )}
                        <div className="text-xs text-muted">
                          {[l.category, l.address].filter(Boolean).join(" · ") || "No category or address"}
                        </div>
                        <div className="text-xs text-muted">{l.client ? `Client: ${l.client.businessName}` : "Not linked to a client"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {ok ? (
                          <>
                            <div>{num(l.searchViews28d)} on Search</div>
                            <div>{num(l.mapsViews28d)} on Maps</div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {ok ? (
                          <>
                            <div>{num(l.calls28d)} calls</div>
                            <div>{num(l.websiteClicks28d)} website clicks</div>
                            <div>{num(l.directions28d)} direction requests</div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {l.rating !== null ? (
                          <>
                            <div>★ {l.rating.toFixed(1)}</div>
                            <div className="text-muted">{num(l.reviewCount)} reviews</div>
                          </>
                        ) : (
                          <span className="text-muted">{l.reviewsState && l.reviewsState !== "ok" ? "Could not be read" : "—"}</span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-xs">
                        {!live ? (
                          <span className="text-muted">—</span>
                        ) : l.missing.length ? (
                          <span className="text-amber-700 dark:text-amber-400">Missing: {l.missing.join(", ")}</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">Nothing missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={ok ? "Synced" : !live ? "Added by hand" : l.syncState === "never" ? "Not synced yet" : "Sync failed"}
                          variant={ok ? "success" : !live || l.syncState === "never" ? "neutral" : "danger"}
                        />
                        <div className="mt-1 max-w-[240px] text-xs text-muted">
                          {ok
                            ? `Data to ${day(l.periodEnd)}`
                            : !live
                              ? "No Google location ID"
                              : l.syncState === "never"
                                ? "Press Sync now"
                                : `${GBP_STATE_COPY[l.syncState as GbpSyncState] ?? l.syncState}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{live ? <SyncProfileButton id={l.id} /> : null}</td>
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
