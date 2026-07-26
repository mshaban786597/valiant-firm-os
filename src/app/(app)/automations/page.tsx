import { PageShell } from "@/components/layout/page-shell";
import {
  AutomationsWorkspace,
  type AutomationRow,
} from "@/components/automations/automations-workspace";
import {
  WorkflowsWorkspace,
  type WorkflowRow,
} from "@/components/automations/workflows-workspace";
import { actionsSchema } from "@/lib/automations/types";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function AutomationsPage() {
  const { organizationId } = await requireSessionOrg();

  const [logs, workflows] = await Promise.all([
    prisma.automationLog.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.workflow.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const workflowRows: WorkflowRow[] = workflows.map((w) => {
    const parsed = actionsSchema.safeParse(w.actions);
    return {
      id: w.id,
      name: w.name,
      trigger: w.trigger,
      actionCount: parsed.success ? parsed.data.length : 0,
      enabled: w.enabled,
      runCount: w.runCount,
      lastRunAt: w.lastRunAt ? w.lastRunAt.toISOString() : null,
    };
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
    <PageShell title="Automations">
      <WorkflowsWorkspace workflows={workflowRows} />
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Manual entries track orchestration health alongside webhook-driven logs. Edit counts and
        status as your automations evolve.
      </div>
      <AutomationsWorkspace initial={rows} />
    </PageShell>
  );
}
