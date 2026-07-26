import { PageShell } from "@/components/layout/page-shell";
import {
  AutomationsWorkspace,
  type AutomationRow,
} from "@/components/automations/automations-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function AutomationsPage() {
  const { organizationId } = await requireSessionOrg();

  const logs = await prisma.automationLog.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const rows: AutomationRow[] = logs.map((log) => ({
    id: log.id,
    name: log.name,
    trigger: log.trigger,
    status: log.status,
    lastRun: log.lastRun ? log.lastRun.toISOString() : null,
    successCount: log.successCount,
    failureCount: log.failureCount,
    errorMessage: log.errorMessage,
    connectedTools: log.connectedTools ?? [],
  }));

  return (
    <PageShell title="Automation Logs">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Manual entries track orchestration health alongside webhook-driven logs. Edit counts and
        status as your automations evolve.
      </div>
      <AutomationsWorkspace initial={rows} />
    </PageShell>
  );
}
