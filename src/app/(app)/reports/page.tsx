import { PageShell } from "@/components/layout/page-shell";
import {
  ReportsWorkspace,
  type ReportRow,
} from "@/components/reports/reports-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function ReportsPage() {
  const { organizationId } = await requireSessionOrg();

  const [reports, clients] = await Promise.all([
    prisma.report.findMany({
      where: { organizationId },
      include: { client: { select: { businessName: true } } },
      orderBy: { month: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
      take: 300,
    }),
  ]);

  const rows: ReportRow[] = reports.map((r) => ({
    id: r.id,
    month: r.month,
    clientId: r.clientId,
    clientName: r.client.businessName,
    organicSessions: r.organicSessions,
    organicLeads: r.organicLeads,
    status: r.status,
  }));

  return (
    <PageShell title="Reporting Engine">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Structured metrics and status workflow. Use{" "}
        <code className="rounded bg-background px-1 py-0.5 text-xs">
          /api/ai/generate-report-summary
        </code>{" "}
        to draft narrative sections from metrics JSON when AI is configured.
      </div>

      <ReportsWorkspace reports={rows} clients={clients} />
    </PageShell>
  );
}
