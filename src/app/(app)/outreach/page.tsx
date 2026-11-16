import Link from "next/link";
import { LeadStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LogReplyButton } from "@/components/outreach/log-reply";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";
import { providerFor, salesMetrics } from "@/lib/outreach/engine";
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

export default async function OutreachPage() {
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const scoped = { organizationId, isDemo: scope.isDemo };

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

  return (
    <PageShell title="Outreach Engine" actions={<LogReplyButton leads={leadOptions} />}>
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Showing {scope.label.toLowerCase()}. Sequence: first email on approval, a follow-up after 4
        business days, then a final one 5 business days later. Suppression, replies and bookings are
        rechecked before every send.{" "}
        {sender
          ? `Sender in this scope: ${sender.name === "test" ? "test sender (nothing leaves the app)" : sender.name}.`
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
        Email opens are not counted here: they are an unreliable optional signal. {suppressed} address
        {suppressed === 1 ? " is" : "es are"} on the do-not-email list.
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Emails</h2>
        {sends.length === 0 ? (
          <EmptyState
            title="No outreach emails yet"
            description="Draft an email from Review & Approvals. It is scheduled only after approval."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Step</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">When</th>
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
          <h2 className="text-sm font-semibold">Replies</h2>
          {replies.length === 0 ? (
            <EmptyState title="No replies logged" description="Use Log a reply when a prospect answers." />
          ) : (
            <div className="space-y-2">
              {replies.map((r) => (
                <div key={r.id} className="rounded-xl border border-card-border bg-card p-3 text-sm shadow-sm">
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
          <h2 className="text-sm font-semibold">Meetings</h2>
          {meetings.length === 0 ? (
            <EmptyState
              title="No meetings recorded"
              description="A meeting appears here only after the calendar confirms it."
            />
          ) : (
            <div className="space-y-2">
              {meetings.map((m) => (
                <div key={m.id} className="rounded-xl border border-card-border bg-card p-3 text-sm shadow-sm">
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
        <h2 className="text-sm font-semibold">Outreach queue</h2>
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" description="Leads scoring 65+ or marked for outreach appear here." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
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
