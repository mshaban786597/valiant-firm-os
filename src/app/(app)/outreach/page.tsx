import Link from "next/link";
import { ApprovalStatus, LeadStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LogReplyButton } from "@/components/outreach/log-reply";
import { LogMeetingButton } from "@/components/outreach/log-meeting";
import { ProspectingPanel, type TargetRow } from "@/components/outreach/prospecting-panel";
import { resolveSerpProvider } from "@/lib/prospecting/run-target";
import { CATEGORY_LABEL } from "@/lib/prospecting/rules";
import { groupOutreachStats, prospectStage, type StatLead, type StatRow } from "@/lib/prospecting/stats";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";
import { providerFor, salesMetrics } from "@/lib/outreach/engine";
import { dailyLimit } from "@/lib/outreach/pace";
import { seenText } from "@/lib/outreach/seen";
import { REPLY_LABELS, type ReplyLabel } from "@/lib/outreach/sequence";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SEND_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  sent: { label: "Sent (provider confirmed)", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  canceled: { label: "Canceled", variant: "neutral" },
  failed: { label: "Failed", variant: "danger" },
  sending: { label: "Needs reconcile", variant: "warning" },
  needs_reconcile: { label: "Needs reconcile", variant: "warning" },
};

function StatTable({ title, rows, label, hrefFor }: { title: string; rows: StatRow[]; label: (k: string) => string; hrefFor: (k: string) => string }) {
  return (
    <section className="space-y-2">
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to show yet" description="Results appear here once prospects are added." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2 text-right">Prospects</th>
                <th className="px-3 py-2 text-right">To approve</th>
                <th className="px-3 py-2 text-right">Sent</th>
                <th className="px-3 py-2 text-right">Opened</th>
                <th className="px-3 py-2 text-right">Follow-up due</th>
                <th className="px-3 py-2 text-right">Replied</th>
                <th className="px-3 py-2 text-right">Meetings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-card-border">
                  <td className="px-3 py-2">
                    <Link className="font-semibold hover:text-valiant" href={hrefFor(r.key)}>
                      {label(r.key)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{r.prospects}</td>
                  <td className="px-3 py-2 text-right">{r.awaitingApproval}</td>
                  <td className="px-3 py-2 text-right">{r.sent}</td>
                  <td className="px-3 py-2 text-right">{r.opened}</td>
                  <td className="px-3 py-2 text-right">{r.followUpsDue}</td>
                  <td className="px-3 py-2 text-right">{r.replied}</td>
                  <td className="px-3 py-2 text-right">{r.meetings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function OutreachPage(props: { searchParams?: Promise<{ category?: string; niche?: string }> }) {
  const searchParams = await props.searchParams;
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const scoped = { organizationId, isDemo: scope.isDemo };
  const categoryFilter = searchParams?.category || null;
  const nicheFilter = searchParams?.niche || null;

  const [metrics, queue, sends, replies, meetings, suppressed, leadOptions] = await Promise.all([
    salesMetrics(organizationId, scope.isDemo),
    prisma.lead.findMany({
      where: { ...scoped, OR: [{ leadScore: { gte: 65 } }, { status: LeadStatus.OutreachQueue }] },
      orderBy: [{ leadScore: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.outreachSend.findMany({
      where: scoped,
      include: { lead: { select: { businessName: true } } },
      orderBy: [{ scheduledFor: "desc" }],
      take: 60,
    }),
    prisma.outreachReply.findMany({
      where: scoped,
      include: { lead: { select: { businessName: true } } },
      orderBy: { receivedAt: "desc" },
      take: 40,
    }),
    prisma.meeting.findMany({
      where: scoped,
      include: { lead: { select: { businessName: true } } },
      orderBy: { startsAt: "desc" },
      take: 40,
    }),
    prisma.suppression.count({ where: { organizationId } }),
    prisma.lead.findMany({
      where: scoped,
      select: { id: true, businessName: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const sender = providerFor(scope.isDemo);

  const [targets, prospectLeads, pendingDrafts] = await Promise.all([
    prisma.prospectTarget.findMany({
      where: scoped,
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.lead.findMany({
      where: {
        ...scoped,
        OR: [{ outreachCategory: { not: null } }, { sends: { some: {} } }],
      },
      select: {
        id: true,
        businessName: true,
        niche: true,
        city: true,
        state: true,
        email: true,
        outreachCategory: true,
        sends: { select: { step: true, status: true, openedAt: true, scheduledFor: true } },
        replies: { select: { label: true } },
        meetings: { select: { status: true } },
        evidence: { where: { kind: "rank_observation" }, orderBy: { observedAt: "desc" }, take: 1, select: { position: true, query: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.approvalRequest.findMany({
      where: { ...scoped, kind: "outreach_email", status: ApprovalStatus.PENDING, entityType: "Lead" },
      select: { entityId: true },
    }),
  ]);
  const pending: Record<string, true> = {};
  pendingDrafts.forEach((a) => {
    if (a.entityId) pending[a.entityId] = true;
  });
  const statLeads: (StatLead & { row: (typeof prospectLeads)[number] })[] = prospectLeads.map((l) => ({
    id: l.id,
    niche: l.niche,
    outreachCategory: l.outreachCategory,
    email: l.email,
    hasPendingDraft: !!pending[l.id],
    sends: l.sends,
    replies: l.replies,
    meetings: l.meetings,
    row: l,
  }));
  const byCategory = groupOutreachStats(statLeads, "category");
  const byNiche = groupOutreachStats(statLeads, "niche");
  const shown = statLeads.filter(
    (l) =>
      (!categoryFilter || (l.outreachCategory ?? "manual") === categoryFilter) &&
      (!nicheFilter || (l.niche || "Unspecified") === nicheFilter),
  );
  const targetRows: TargetRow[] = targets.map((t) => ({
    id: t.id,
    niche: t.niche,
    keyword: t.keyword,
    city: t.city,
    state: t.state,
    active: t.active,
    lastRunAt: t.lastRunAt ? t.lastRunAt.toISOString() : null,
    lastRun: t.runs[0]
      ? { status: t.runs[0].status, resultsSeen: t.runs[0].resultsSeen, added: t.runs[0].added, provider: t.runs[0].provider, error: t.runs[0].error }
      : null,
  }));
  const openedSends = sends.filter((s) => !!s.openedAt).length;

  return (
    <PageShell
      title="Outreach Engine"
      actions={
        <div className="flex gap-2">
          <LogMeetingButton leads={leadOptions} />
          <LogReplyButton leads={leadOptions} />
        </div>
      }
    >
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Showing {scope.label.toLowerCase()}. Sequence: first email on approval, a follow-up after 4
        business days, then a final one 5 business days later. Suppression, replies and bookings are
        rechecked before every send.{" "}
        {sender
          ? `Sender in this scope: ${sender.name === "test" ? "test sender (nothing leaves the app)" : sender.name === "mailbox" ? `your outreach mailbox, at most ${dailyLimit()} a day after a three-week warm-up` : sender.name}.`
          : "Real outreach sending is switched off, so approved emails stay scheduled and nothing is sent."}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Prospects discovered" value={String(metrics.discovered)} />
        <KpiCard label="Qualified" value={String(metrics.qualified)} />
        <KpiCard label="Confirmed sends" value={String(metrics.confirmedSends)} hint="Accepted by the sender" />
        <KpiCard label="Positive replies" value={String(metrics.positiveReplies)} hint="Labeled Interested" />
        <KpiCard label="Confirmed meetings" value={String(metrics.confirmedMeetings)} hint="Confirmed by the calendar" />
        <KpiCard label="Attended meetings" value={String(metrics.attendedMeetings)} />
        <KpiCard label="Wins" value={String(metrics.wins)} />
        <KpiCard label="Won monthly revenue" value={formatCurrency(metrics.wonMonthlyRevenue)} hint="Closed-won deals" />
      </div>
      <p className="text-xs text-muted">
        Opens are reported by the email provider when the tracking image loads. Some mail apps load it
        automatically and some block it, so treat an open as a hint, not proof. {suppressed} address
        {suppressed === 1 ? " is" : "es are"} on the do-not-email list.
      </p>

      <ProspectingPanel targets={targetRows} providerConnected={(await resolveSerpProvider(organizationId)) !== null} />

      <div className="grid gap-4 xl:grid-cols-2">
        <StatTable
          title="Results by category"
          rows={byCategory}
          label={(k) => CATEGORY_LABEL[k] ?? k}
          hrefFor={(k) => `/outreach?category=${encodeURIComponent(k)}`}
        />
        <StatTable
          title="Results by niche"
          rows={byNiche}
          label={(k) => k}
          hrefFor={(k) => `/outreach?niche=${encodeURIComponent(k)}`}
        />
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">
            Prospects
            {categoryFilter ? ` · ${CATEGORY_LABEL[categoryFilter] ?? categoryFilter}` : ""}
            {nicheFilter ? ` · ${nicheFilter}` : ""}
          </h2>
          {categoryFilter || nicheFilter ? (
            <Link href="/outreach" className="text-xs font-semibold text-valiant">
              Show all
            </Link>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <EmptyState
            title="No prospects here yet"
            description="Prospects appear after the prospecting agent runs a saved search, or when an email is drafted for a lead."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Why picked</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Where it stands</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 150).map((l) => {
                  const rank = l.row.evidence[0];
                  return (
                    <tr key={l.id} className="border-t border-card-border">
                      <td className="px-4 py-3">
                        <Link className="font-semibold hover:text-valiant" href={`/leads/${l.id}`}>
                          {l.row.businessName}
                        </Link>
                        <div className="text-xs text-muted">
                          {[l.row.city, l.row.state].filter(Boolean).join(", ")} · {l.row.niche ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">{CATEGORY_LABEL[l.outreachCategory ?? "manual"] ?? l.outreachCategory}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {rank?.position ? `#${rank.position} for "${rank.query}"` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{l.email ?? "No email found"}</td>
                      <td className="px-4 py-3 text-xs">{prospectStage(l)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="section-title">
          Emails <span className="font-normal text-muted">· {openedSends} opened of the {sends.length} shown</span>
        </h2>
        {sends.length === 0 ? (
          <EmptyState
            title="No outreach emails yet"
            description="Draft an email from Review & Approvals. It is scheduled only after approval."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Step</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Seen</th>
                  <th className="px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => {
                  const b = SEND_BADGE[s.status] ?? { label: s.status, variant: "neutral" as const };
                  return (
                    <tr key={s.id} className="border-t border-card-border">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{s.lead.businessName}</div>
                        <div className="text-xs text-muted">{s.toEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-muted">{s.step === 0 ? "First email" : `Follow-up ${s.step}`}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={b.label} variant={b.variant} />
                        {s.cancelReason ? <div className="mt-1 text-xs text-muted">{s.cancelReason}</div> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        {s.sentAt ? `Sent ${s.sentAt.toLocaleString()}` : `Due ${s.scheduledFor.toLocaleString()}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        {seenText(s)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {s.providerMessageId ? `${s.provider}: ${s.providerMessageId}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="section-title">Replies</h2>
          {replies.length === 0 ? (
            <EmptyState title="No replies yet" description="Replies to your outreach mailbox appear here by themselves. You can also use Log a reply." />
          ) : (
            <div className="space-y-2">
              {replies.map((r) => (
                <div key={r.id} className="rounded-xl border border-card-border bg-card p-3 text-sm shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{r.lead.businessName}</div>
                    <div className="flex gap-1">
                      <StatusBadge
                        label={REPLY_LABELS[r.label as ReplyLabel] ?? r.label}
                        variant={r.label === "interested" ? "success" : r.label === "unsubscribe" || r.label === "bounce" ? "danger" : "info"}
                      />
                      {r.needsReview ? <StatusBadge label="Owner review" variant="warning" /> : null}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{r.body.slice(0, 220)}</p>
                  <div className="mt-1 text-[11px] text-muted">{r.receivedAt.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="section-title">Meetings</h2>
          {meetings.length === 0 ? (
            <EmptyState
              title="No meetings recorded"
              description="Use Log a meeting once the calendar has the booking. It also stops the remaining follow-ups."
            />
          ) : (
            <div className="space-y-2">
              {meetings.map((m) => (
                <div key={m.id} className="rounded-xl border border-card-border bg-card p-3 text-sm shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{m.lead?.businessName ?? "Unlinked"}</div>
                    <StatusBadge
                      label={m.status.replace(/_/g, " ")}
                      variant={m.status === "canceled" || m.status === "no_show" ? "neutral" : "success"}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {m.startsAt.toLocaleString()} · {m.calendarSource.replace(/_/g, " ")} · event {m.externalEventId}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="section-title">Outreach queue</h2>
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" description="Leads scoring 65+ or marked for outreach appear here." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Findings</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((lead) => (
                  <tr key={lead.id} className="border-t border-card-border hover:bg-background/30">
                    <td className="px-4 py-3">
                      <Link className="font-semibold hover:text-valiant" href={`/leads/${lead.id}`}>
                        {lead.businessName}
                      </Link>
                      <div className="text-xs text-muted">
                        {lead.city}, {lead.state} · {lead.niche}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={lead.leadScore} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      GBP: {lead.gbpStatus ?? "—"}
                      <div>Site: {lead.websiteStatus ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={lead.status} variant="neutral" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}
