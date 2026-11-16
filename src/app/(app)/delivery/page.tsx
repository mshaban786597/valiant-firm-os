import { PageShell } from "@/components/layout/page-shell";
import { DeliveryToolbar } from "@/components/delivery/task-form-modal";
import { TaskBoard, type DeliveryTask } from "@/components/delivery/task-board";
import { ReconcileStrip } from "@/components/monitoring/reconcile-strip";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";
import { getMonitoringSummary } from "@/lib/monitoring/summary";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const scoped = { organizationId, isDemo: scope.isDemo };

  const [tasks, clients, summary] = await Promise.all([
    prisma.task.findMany({
      where: scoped,
      include: { client: { select: { businessName: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 400,
    }),
    prisma.client.findMany({
      where: scoped,
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
      take: 300,
    }),
    getMonitoringSummary(organizationId, scope.isDemo),
  ]);

  const mapped: DeliveryTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    clientName: t.client.businessName,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return (
    <PageShell title="Task & Delivery System" actions={<DeliveryToolbar clients={clients} />}>
      <ReconcileStrip summary={summary} focus="tasks" />
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        {tasks.length} task{tasks.length === 1 ? "" : "s"} in {scope.label.toLowerCase()}. Incident
        tasks move to QA automatically when their check recovers, so a person confirms the fix and
        closes them.
      </div>
      <TaskBoard tasks={mapped} />
    </PageShell>
  );
}
