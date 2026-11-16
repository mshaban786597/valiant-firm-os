import Link from "next/link";
import { ApprovalStatus, IncidentStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AddWebsiteButton, RunAllButton } from "@/components/automation/site-actions";
import { INTEGRATIONS, integrationState } from "@/lib/integrations/catalog";
import { channelStatus } from "@/lib/notifications/dispatch";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export const dynamic = "force-dynamic";

/**
 * The VF AI Automation System control plane: websites → monitor → analyze →
 * plan → execute → test → report, with every number read from the database.
 */
export default async function AutomationSystemPage() {
  const { organizationId } = await requireSessionOrg();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const open = { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] };

  const [monitors, checks24h, openIncidents, incidents24h, resolved24h, openTasks, pendingApprovals, reports, alertsSent, clients] =
    await Promise.all([
      prisma.monitor.findMany({
        where: { organizationId },
        select: { id: true, name: true, target: true, type: true, lastStatus: true, lastCheckAt: true, enabled: true },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      prisma.monitorCheck.count({ where: { organizationId, observedAt: { gte: since } } }),
      prisma.incident.count({ where: { organizationId, status: open } }),
      prisma.incident.count({ where: { organizationId, firstSeenAt: { gte: since } } }),
      prisma.incident.count({ where: { organizationId, resolvedAt: { gte: since } } }),
      prisma.task.count({ where: { organizationId, serviceType: "Monitoring", status: { not: "Completed" } } }),
      prisma.approvalRequest.count({ where: { organizationId, status: ApprovalStatus.PENDING } }),
      prisma.report.count({ where: { organizationId } }).catch(() => 0),
      prisma.notificationLog.count({ where: { organizationId, status: "sent", createdAt: { gte: since } } }),
      prisma.client.findMany({
        where: { organizationId },
        select: { id: true, businessName: true },
        orderBy: { businessName: "asc" },
      }),
    ]);

  // Group monitors into websites by target.
  const siteOrder: string[] = [];
  const sites: Record<string, { target: string; total: number; ok: number; fail: number; lastCheckAt: Date | null }> = {};
  monitors.forEach((m) => {
    if (m.type === "LEAD_ROUTE" || m.type === "CUSTOM") return;
    let host = m.target;
    try {
      host = new URL(m.target.startsWith("http") ? m.target : `https://${m.target}`).host;
    } catch {
      /* keep raw target */
    }
    if (!sites[host]) {
      sites[host] = { target: host, total: 0, ok: 0, fail: 0, lastCheckAt: null };
      siteOrder.push(host);
    }
    const s = sites[host]!;
    s.total++;
    if (m.lastStatus === "ok") s.ok++;
    if (m.lastStatus === "fail") s.fail++;
    if (m.lastCheckAt && (!s.lastCheckAt || m.lastCheckAt > s.lastCheckAt)) s.lastCheckAt = m.lastCheckAt;
  });

  const connectedTools = INTEGRATIONS.filter((t) => integrationState(t) === "connected").length;
  const channels = channelStatus();
  const channelNames = (["email", "slack", "telegram"] as const).filter((c) => channels[c]);

  const steps = [
    { n: 1, title: "Monitor", value: checks24h, unit: "checks in the last 24h", href: "/monitoring" },
    { n: 2, title: "Analyze", value: incidents24h, unit: "issues detected in the last 24h", href: "/monitoring" },
    { n: 3, title: "Plan", value: openTasks, unit: "open fix tasks", href: "/delivery" },
    { n: 4, title: "Execute", value: pendingApprovals, unit: "changes waiting for your review", href: "/approvals" },
    { n: 5, title: "Test", value: resolved24h, unit: "issues confirmed fixed in the last 24h", href: "/monitoring" },
    { n: 6, title: "Report", value: reports, unit: "reports generated", href: "/reports" },
  ];

  return (
    <PageShell
      title="Automation System"
      actions={
        <div className="flex gap-2">
          <RunAllButton />
          <AddWebsiteButton clients={clients} />
        </div>
      }
    >
      {/* Workflow */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Workflow</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((s) => (
            <Link
              key={s.n}
              href={s.href}
              className="rounded-xl border border-card-border bg-card p-4 shadow-sm transition-colors hover:border-valiant/40"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {s.n}. {s.title}
              </div>
              <div className="mt-1 text-2xl font-semibold">{s.value}</div>
              <div className="text-xs text-muted">{s.unit}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Websites */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your websites</h2>
          <span className="text-xs text-muted">
            {openIncidents} open issue{openIncidents === 1 ? "" : "s"}
          </span>
        </div>
        {siteOrder.length === 0 ? (
          <EmptyState
            title="No websites yet"
            description="Add a website to start uptime, speed, security, indexing, broken link and content checks."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Checks passing</th>
                  <th className="px-4 py-3">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {siteOrder.map((host) => {
                  const s = sites[host]!;
                  const checked = s.ok + s.fail > 0 || s.lastCheckAt !== null;
                  return (
                    <tr key={host} className="border-t border-card-border">
                      <td className="px-4 py-3 font-semibold">{host}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={!checked ? "Not checked yet" : s.fail > 0 ? "Needs attention" : "Healthy"}
                          variant={!checked ? "neutral" : s.fail > 0 ? "danger" : "success"}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {s.ok}/{s.total}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        {s.lastCheckAt ? s.lastCheckAt.toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* System status */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link href="/integrations" className="rounded-xl border border-card-border bg-card p-4 shadow-sm hover:border-valiant/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Tool integrations</div>
          <div className="mt-1 text-2xl font-semibold">
            {connectedTools}/{INTEGRATIONS.length}
          </div>
          <div className="text-xs text-muted">connected</div>
        </Link>
        <Link href="/integrations" className="rounded-xl border border-card-border bg-card p-4 shadow-sm hover:border-valiant/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Alert channels</div>
          <div className="mt-1 text-2xl font-semibold">{channelNames.length}/3</div>
          <div className="text-xs capitalize text-muted">
            {channelNames.length ? channelNames.join(", ") : "none connected — alerts stay in the app"}
          </div>
        </Link>
        <Link href="/approvals" className="rounded-xl border border-card-border bg-card p-4 shadow-sm hover:border-valiant/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Alerts delivered (24h)</div>
          <div className="mt-1 text-2xl font-semibold">{alertsSent}</div>
          <div className="text-xs text-muted">by email, Slack or Telegram</div>
        </Link>
      </section>
    </PageShell>
  );
}
