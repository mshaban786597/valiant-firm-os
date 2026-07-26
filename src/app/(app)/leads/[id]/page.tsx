import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { LeadActions } from "@/components/leads/lead-actions";
import { LeadDetailCrud } from "@/components/leads/lead-detail-crud";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { mapLeadToScoreInput } from "@/lib/mappers/lead";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organizationId } = await requireSessionOrg();

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId },
    include: { scores: { orderBy: { createdAt: "desc" }, take: 3 } },
  });

  if (!lead) notFound();

  const payload = mapLeadToScoreInput(lead);

  return (
    <PageShell title={lead.businessName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          <Link href="/leads" className="text-valiant hover:underline">
            ← Back to leads
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScoreBadge score={lead.leadScore} />
          <StatusBadge label={lead.status} variant="info" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-card-border bg-card p-4 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Firmographics
          </div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">Market</dt>
              <dd className="font-medium">
                {lead.niche} · {lead.city}, {lead.state}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">Website</dt>
              <dd className="font-medium">{lead.websiteUrl ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">Contact</dt>
              <dd className="font-medium">
                {lead.email ?? "—"} · {lead.phone ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">Signals</dt>
              <dd className="font-medium">
                DA {lead.domainAuthority ?? "—"} · Reviews {lead.reviewCount ?? "—"} ·{" "}
                {lead.starRating ?? "—"}★
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted">GBP / Site</dt>
              <dd className="text-right font-medium">
                {lead.gbpStatus ?? "—"}
                <div className="text-xs text-muted">{lead.websiteStatus ?? "—"}</div>
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Recommended motion
            </div>
            <p className="mt-2 text-sm text-foreground">
              {lead.recommendedOffer ?? "Run scoring to generate an offer hypothesis."}
            </p>
            <p className="mt-2 text-xs text-muted">{lead.outreachAngle ?? ""}</p>
          </div>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            AI workspace
          </div>
          <div className="mt-3">
            <LeadActions leadId={lead.id} payload={payload} />
          </div>
          <div className="mt-6 border-t border-card-border pt-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Record actions
            </div>
            <div className="mt-3">
              <LeadDetailCrud
                lead={{
                  id: lead.id,
                  businessName: lead.businessName,
                  niche: lead.niche,
                  city: lead.city,
                  state: lead.state,
                  websiteUrl: lead.websiteUrl,
                  phone: lead.phone,
                  email: lead.email,
                  source: lead.source,
                  status: lead.status,
                  manualOpened: lead.manualOpened,
                  manualReplied: lead.manualReplied,
                  manualBooked: lead.manualBooked,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Recent scores
        </div>
        <div className="mt-3 space-y-2">
          {lead.scores.length ? (
            lead.scores.map((s) => (
              <div key={s.id} className="rounded-lg border border-card-border bg-background/40 p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{s.priorityStatus}</span>
                  <span className="text-muted">
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 text-muted">
                  Composite <span className="font-semibold text-foreground">{s.compositeScore}</span>{" "}
                  · SEO {s.seoWeaknessScore}/25 · GBP {s.gbpScore}/20 · Reviews{" "}
                  {s.reviewVelocityScore}/20 · Site {s.websiteQualityScore}/20 · Biz{" "}
                  {s.businessSignalScore}/15
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted">No persisted scores yet.</div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
