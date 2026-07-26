import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

const ENTITY_FILTERS = [
  "All",
  "Lead",
  "Deal",
  "Client",
  "Invoice",
  "Workflow",
  "EmailCampaign",
  "GbpLocation",
  "Permission",
];

function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { entity?: string };
}) {
  const { organizationId } = await requireSessionOrg();
  const entity = searchParams.entity && searchParams.entity !== "All" ? searchParams.entity : null;

  const logs = await prisma.auditLog.findMany({
    where: { organizationId, ...(entity ? { entity } : {}) },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <PageShell title="Activity Feed">
      <div className="flex flex-wrap gap-2">
        {ENTITY_FILTERS.map((f) => {
          const active = (f === "All" && !entity) || f === entity;
          return (
            <Link
              key={f}
              href={f === "All" ? "/activity" : `/activity?entity=${f}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                active
                  ? "bg-valiant-soft text-foreground ring-1 ring-valiant/30"
                  : "border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {f}
            </Link>
          );
        })}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Every create, update, and delete across the organization shows up here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-3 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs font-medium text-foreground">
                    {log.action}
                  </code>
                  <span className="text-xs text-muted">{log.entity}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted">
                  {log.user?.name ?? log.user?.email ?? "System"}
                  {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted">{timeAgo(log.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
