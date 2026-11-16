import { ApprovalStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  ApprovalsWorkspace,
  type ApprovalRow,
} from "@/components/approvals/approvals-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { organizationId } = await requireSessionOrg();

  const [pending, history, approvedCount, rejectedCount, leads] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: { organizationId, status: ApprovalStatus.PENDING },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.approvalRequest.findMany({
      where: { organizationId, status: { not: ApprovalStatus.PENDING } },
      orderBy: { decidedAt: "desc" },
      take: 50,
    }),
    prisma.approvalRequest.count({ where: { organizationId, status: ApprovalStatus.APPROVED } }),
    prisma.approvalRequest.count({ where: { organizationId, status: ApprovalStatus.REJECTED } }),
    prisma.lead.findMany({
      where: { organizationId },
      select: { id: true, businessName: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const toRow = (a: (typeof pending)[number]): ApprovalRow => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    body: a.body,
    status: a.status,
    outcome: a.outcome,
    createdAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
  });

  return (
    <PageShell title="Review & Approvals">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Waiting for review" value={String(pending.length)} />
        <KpiCard label="Approved" value={String(approvedCount)} />
        <KpiCard label="Rejected" value={String(rejectedCount)} />
      </div>
      <ApprovalsWorkspace
        pending={pending.map(toRow)}
        history={history.map(toRow)}
        leads={leads.map((l) => ({ id: l.id, businessName: l.businessName, hasEmail: !!l.email }))}
      />
    </PageShell>
  );
}
