import { PageShell } from "@/components/layout/page-shell";
import {
  PipelineBoard,
  type PipelineDeal,
} from "@/components/pipeline/pipeline-board";
import { PipelineToolbar } from "@/components/pipeline/deal-form-modal";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { money } from "@/lib/money";

export default async function PipelinePage() {
  const { organizationId } = await requireSessionOrg();

  const [deals, leadOptions] = await Promise.all([
    prisma.deal.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.lead.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
      take: 300,
    }),
  ]);

  const mapped: PipelineDeal[] = deals.map((d) => ({
    id: d.id,
    businessName: d.businessName,
    stage: d.stage,
    monthlyValue: money(d.monthlyValue),
    closeProbability: d.closeProbability,
    leadId: d.leadId,
    contactName: d.contactName,
    serviceInterest: d.serviceInterest,
    proposalValue: money(d.proposalValue),
  }));

  return (
    <PageShell title="Sales Pipeline" actions={<PipelineToolbar leadOptions={leadOptions} />}>
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Move stages with the dropdown on each card (saved to the database). Closing Won from a
        non-won stage auto-creates a client and onboarding checklist. Use Add deal for manual
        opportunities.
      </div>
      <PipelineBoard deals={mapped} leadOptions={leadOptions} />
    </PageShell>
  );
}
