import { PageShell } from "@/components/layout/page-shell";
import { DeliveryToolbar } from "@/components/delivery/task-form-modal";
import { TaskBoard, type DeliveryTask } from "@/components/delivery/task-board";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function DeliveryPage() {
  const { organizationId } = await requireSessionOrg();

  const [tasks, clients] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId },
      include: { client: { select: { businessName: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 400,
    }),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, businessName: true },
      orderBy: { businessName: "asc" },
      take: 300,
    }),
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
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Status changes save to the database immediately. Add tasks against any client; delete
        removes the row permanently.
      </div>
      <TaskBoard tasks={mapped} />
    </PageShell>
  );
}
