import Link from "next/link";
import type { MonitoringSummary } from "@/lib/monitoring/summary";
import { passRateLabel, uptimeLabel } from "@/lib/monitoring/state";

/**
 * The same monitoring numbers on every page that shows them (Dashboard,
 * Monitoring, Client Health, Delivery). Each figure links to the records that
 * produce it, and the scope + time window are always stated.
 */
export function ReconcileStrip({ summary, focus }: { summary: MonitoringSummary; focus?: string }) {
  const c = summary.checks;
  const up = uptimeLabel(summary.uptime);
  const items: { key: string; label: string; value: string; hint: string; href: string }[] = [
    {
      key: "checks",
      label: "Latest-check pass rate",
      value: c.passRatePct === null ? "No data" : `${c.passRatePct}%`,
      hint: passRateLabel(c),
      href: "/monitoring",
    },
    {
      key: "uptime",
      label: `Uptime (last ${summary.uptime.windowHours}h)`,
      value: up.value,
      hint: up.hint,
      href: "/monitoring",
    },
    {
      key: "incidents",
      label: "Open incidents",
      value: String(summary.openIncidents),
      hint:
        summary.openIncidentsWithoutTask > 0
          ? `${summary.openIncidentsWithoutTask} without a task (check has no client)`
          : "Open or acknowledged right now",
      href: "/monitoring",
    },
    {
      key: "alerts",
      label: "Active alerts",
      value: String(summary.activeAlerts),
      hint: `${summary.historicalAlerts} in history (recovered or dismissed)`,
      href: "/health",
    },
    {
      key: "tasks",
      label: "Incident tasks open",
      value: String(summary.openIncidentTasks),
      hint: `${summary.recoveredTasksAwaitingClosure} recovered, waiting to be closed`,
      href: "/delivery",
    },
  ];

  return (
    <section className="rounded-xl border border-card-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Monitoring status</h2>
        <span className="text-[11px] text-muted">
          Scope: {summary.scope.label} · all sites and environments · window {summary.scope.windowHours}h
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {items.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            className={`rounded-lg border p-3 transition-colors hover:border-valiant/40 ${
              focus === i.key ? "border-valiant/40 bg-valiant-soft" : "border-card-border bg-background"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{i.label}</div>
            <div className="mt-1 text-xl font-semibold">{i.value}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted">{i.hint}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
