import Link from "next/link";
import { headers } from "next/headers";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeleteLeadButton, IntakePanel, LeadStatusSelect, type IntakeSite } from "@/components/inbox/inbox-controls";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { ownershipLabel } from "@/lib/sites/registry";
import { LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, leadSummary } from "@/lib/site-leads/parse";

export const dynamic = "force-dynamic";

async function appOrigin(): Promise<string> {
  const configured = process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

export default async function InboxPage(
  props: { searchParams?: Promise<{ site?: string; status?: string; kind?: string }> }
) {
  const searchParams = await props.searchParams;
  const { organizationId } = await requireSessionOrg();
  const siteFilter = searchParams?.site || null;
  const statusFilter = searchParams?.status && (LEAD_STATUSES as readonly string[]).indexOf(searchParams.status) !== -1 ? searchParams.status : null;
  const kindFilter = searchParams?.kind || null;

  const sites = await prisma.site.findMany({
    where: { organizationId },
    include: { client: { select: { businessName: true } } },
    orderBy: { domain: "asc" },
  });
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const real = { organizationId, isTest: false };
  const [leads, newCount, weekCount, totalCount, perSite] = await Promise.all([
    prisma.siteLead.findMany({
      where: {
        organizationId,
        ...(siteFilter ? { siteId: siteFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : { status: { not: "spam" } }),
        ...(kindFilter ? { site: { kind: kindFilter } } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: 200,
    }),
    prisma.siteLead.count({ where: { ...real, status: "new" } }),
    prisma.siteLead.count({ where: { ...real, status: { not: "spam" }, receivedAt: { gte: weekAgo } } }),
    prisma.siteLead.count({ where: { ...real, status: { not: "spam" } } }),
    prisma.siteLead.groupBy({ by: ["siteId"], where: { organizationId }, _count: { _all: true }, _max: { receivedAt: true } }),
  ]);

  const siteById: Record<string, (typeof sites)[number]> = {};
  sites.forEach((s) => (siteById[s.id] = s));
  const stats: Record<string, { n: number; last: Date | null }> = {};
  perSite.forEach((g) => (stats[g.siteId] = { n: g._count._all, last: g._max.receivedAt }));
  const origin = await appOrigin();
  const intakeSites: IntakeSite[] = sites.map((s) => ({
    id: s.id,
    domain: s.domain,
    ownership: ownershipLabel({ kind: s.kind, clientName: s.client?.businessName }),
    intakeUrl: s.intakeKey ? `${origin}/api/intake/${s.intakeKey}` : null,
    received: stats[s.id]?.n ?? 0,
    lastReceivedAt: stats[s.id]?.last ? stats[s.id]!.last!.toISOString() : null,
  }));
  const connected = sites.filter((s) => s.intakeKey).length;
  const local = /localhost|127\.0\.0\.1/.test(origin);

  const link = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { site: siteFilter, status: statusFilter, kind: kindFilter, ...params };
    Object.keys(merged).forEach((k) => {
      const v = merged[k as keyof typeof merged];
      if (v) q.set(k, v);
    });
    const s = q.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-valiant bg-valiant text-white" : "border-card-border text-muted hover:text-foreground"}`;

  return (
    <PageShell title="Leads Inbox">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Enquiries sent from the forms on every website: client sites, rank-and-rent sites and our own. Each website has
        its own private intake address. Nothing appears here until a website&apos;s form is pointed at its address.
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="New" value={String(newCount)} hint="Not handled yet" />
        <KpiCard label="Last 7 days" value={String(weekCount)} />
        <KpiCard label="All enquiries" value={String(totalCount)} hint="Tests and spam not counted" />
        <KpiCard label="Websites connected" value={`${connected} of ${sites.length}`} hint="Intake switched on" />
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">Enquiries</h2>
          <Link href={link({ status: null })} className={chip(!statusFilter)}>
            All
          </Link>
          {LEAD_STATUSES.map((s) => (
            <Link key={s} href={link({ status: s })} className={chip(statusFilter === s)}>
              {LEAD_STATUS_LABEL[s]}
            </Link>
          ))}
          <span className="mx-1 text-muted">|</span>
          <Link href={link({ kind: null })} className={chip(!kindFilter)}>
            Every website
          </Link>
          <Link href={link({ kind: "client" })} className={chip(kindFilter === "client")}>
            Client
          </Link>
          <Link href={link({ kind: "rank_rent" })} className={chip(kindFilter === "rank_rent")}>
            Rank &amp; Rent
          </Link>
          <Link href={link({ kind: "own" })} className={chip(kindFilter === "own")}>
            Our own
          </Link>
          {siteFilter ? (
            <Link href={link({ site: null })} className="text-xs font-semibold text-valiant">
              {siteById[siteFilter]?.domain ?? "Website"} ✕
            </Link>
          ) : null}
        </div>

        {leads.length === 0 ? (
          <EmptyState
            title={totalCount === 0 ? "No enquiries yet" : "Nothing matches these filters"}
            description={
              totalCount === 0
                ? "Switch intake on for a website below, then point its form at the address. Use Send test to see one arrive."
                : "Change the filters above to see other enquiries."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const site = siteById[l.siteId];
                  const extra = l.fields && typeof l.fields === "object" && !Array.isArray(l.fields) ? (l.fields as Record<string, unknown>) : {};
                  return (
                    <tr key={l.id} className="border-t border-card-border align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        {l.receivedAt.toLocaleString()}
                        <div>{LEAD_SOURCE_LABEL[l.source] ?? l.source}</div>
                        {l.isTest ? (
                          <div className="mt-1">
                            <StatusBadge label="Test" variant="warning" />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Link href={link({ site: l.siteId })} className="font-semibold hover:text-valiant">
                          {site?.domain ?? "Removed website"}
                        </Link>
                        <div className="text-muted">{site ? ownershipLabel({ kind: site.kind, clientName: site.client?.businessName }) : ""}</div>
                        {l.formName ? <div className="text-muted">Form: {l.formName}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold">{l.name ?? "No name given"}</div>
                        {l.phone ? (
                          <div>
                            <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} className="hover:text-valiant">
                              {l.phone}
                            </a>
                          </div>
                        ) : null}
                        {l.email ? (
                          <div>
                            <a href={`mailto:${l.email}`} className="hover:text-valiant">
                              {l.email}
                            </a>
                          </div>
                        ) : null}
                        {!l.phone && !l.email ? <div className="text-muted">{leadSummary(l)}</div> : null}
                      </td>
                      <td className="max-w-[420px] px-4 py-3 text-xs">
                        <div className="whitespace-pre-wrap break-words">{l.message ?? <span className="text-muted">No message</span>}</div>
                        {Object.keys(extra).length ? (
                          <div className="mt-1 text-muted">
                            {Object.keys(extra)
                              .slice(0, 6)
                              .map((k) => `${k}: ${String(extra[k])}`)
                              .join(" · ")}
                          </div>
                        ) : null}
                        {l.pageUrl ? <div className="mt-1 truncate text-muted">Page: {l.pageUrl}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <LeadStatusSelect id={l.id} status={l.status} />
                        <div className="mt-2">
                          <DeleteLeadButton id={l.id} isTest={l.isTest} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="section-title">Connect a website</h2>
        {sites.length === 0 ? (
          <EmptyState title="No website registered" description="Register websites on the Websites page first." />
        ) : (
          <>
            <IntakePanel sites={intakeSites} />
            {local ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                You are on a local address ({origin}). A real website cannot reach it: the addresses above only work for
                real forms once the app is deployed.
              </p>
            ) : null}
            <details className="rounded-xl border border-card-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">How a website sends its enquiries here</summary>
              <div className="mt-3 space-y-3 text-xs text-muted">
                <p>
                  Keep the form&apos;s existing email. In addition, send the same fields to the website&apos;s intake address as
                  a normal form post or as JSON. Field names such as name, email, phone and message are recognised
                  automatically; anything else is kept as extra detail.
                </p>
                <p className="font-semibold text-foreground">PHP form handler (after the email is sent)</p>
                <pre className="overflow-x-auto rounded bg-background p-3 text-[11px] leading-relaxed">{`$ch = curl_init('PASTE THE INTAKE ADDRESS HERE');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query([
    'name' => $name, 'email' => $email, 'phone' => $phone,
    'message' => $message, 'page' => $_SERVER['HTTP_REFERER'] ?? '',
  ]),
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 5,
]);
curl_exec($ch);
curl_close($ch);`}</pre>
                <p>
                  WordPress (Elementor, Contact Form 7, WPForms): add a &quot;Webhook&quot; action to the form and paste the
                  intake address. No code is needed.
                </p>
                <p>The address is private. If it leaks, press New address and update the website.</p>
              </div>
            </details>
          </>
        )}
      </section>
    </PageShell>
  );
}
