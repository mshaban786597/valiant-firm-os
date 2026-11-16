import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  IntegrationsWorkspace,
  type IntegrationRow,
  type NotificationRow,
} from "@/components/integrations/integrations-workspace";
import { INTEGRATIONS, integrationState, missingEnv } from "@/lib/integrations/catalog";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { organizationId } = await requireSessionOrg();

  const rows: IntegrationRow[] = INTEGRATIONS.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    powers: t.powers,
    connected: integrationState(t) === "connected",
    // Env var NAMES only — values never leave the server.
    missing: missingEnv(t),
    data: t.data,
  }));

  const logs = await prisma.notificationLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const notifications: NotificationRow[] = logs.map((n) => ({
    id: n.id,
    channel: n.channel,
    event: n.event,
    title: n.title,
    status: n.status,
    error: n.error,
    createdAt: n.createdAt.toISOString(),
  }));

  const connected = rows.filter((r) => r.connected).length;
  const live = rows.filter((r) => r.connected && r.data === "live").length;

  return (
    <PageShell title="Integrations">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Tools in the system" value={String(rows.length)} />
        <KpiCard label="Connected" value={`${connected}/${rows.length}`} />
        <KpiCard label="Running on live data" value={String(live)} />
      </div>
      <IntegrationsWorkspace rows={rows} notifications={notifications} />
    </PageShell>
  );
}
