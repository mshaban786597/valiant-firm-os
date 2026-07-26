import Link from "next/link";
import { LeadStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function OutreachPage() {
  const { organizationId } = await requireSessionOrg();

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      OR: [{ leadScore: { gte: 65 } }, { status: LeadStatus.OutreachQueue }],
    },
    orderBy: [{ leadScore: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });

  return (
    <PageShell title="Outreach Engine">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Sequence blueprint (MVP): Day 1 cold email · Day 3 mini audit · Day 6 proof · Day 10
        LinkedIn · Day 14 close loop · Day 21 archive/re-engage.
      </div>

      <div className="overflow-hidden rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Signals</th>
              <th className="px-4 py-3">Tracking</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3">
                  <Link className="font-semibold hover:text-valiant" href={`/leads/${lead.id}`}>
                    {lead.businessName}
                  </Link>
                  <div className="text-xs text-muted">
                    {lead.city}, {lead.state} · {lead.niche}
                  </div>
                  <div className="mt-1 text-xs text-muted">{lead.outreachAngle ?? ""}</div>
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={lead.leadScore} />
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  GBP: {lead.gbpStatus ?? "—"}
                  <div>Site: {lead.websiteStatus ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge
                      label={lead.sequenceStartedAt ? "Sequence" : "Queued"}
                      variant={lead.sequenceStartedAt ? "success" : "warning"}
                    />
                    <StatusBadge
                      label={lead.manualOpened ? "Opened" : "Open?"}
                      variant={lead.manualOpened ? "info" : "neutral"}
                    />
                    <StatusBadge
                      label={lead.manualReplied ? "Reply" : "No reply"}
                      variant={lead.manualReplied ? "success" : "neutral"}
                    />
                    <StatusBadge
                      label={lead.manualBooked ? "Booked" : "Call?"}
                      variant={lead.manualBooked ? "success" : "neutral"}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-muted">
                    Open a lead to edit outreach signals (opened / reply / booked) — they save to the
                    database from the lead detail screen.
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
