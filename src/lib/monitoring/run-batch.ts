import type { Monitor } from "@prisma/client";
import { runMonitorCheck } from "@/lib/monitoring/runner";
import { recordCheckResult, type CheckTrigger } from "@/lib/monitoring/incidents";
import { isMonitorDue } from "@/lib/monitoring/fingerprint";

export interface BatchSummary {
  checked: number;
  ok: number;
  failed: number;
  unknown: number;
  opened: number;
  resolved: number;
  /** Re-runs inside the check window (recorded, but not fresh observations). */
  retries: number;
}

/**
 * Run a set of monitors with bounded concurrency and drive the incident
 * lifecycle for each. One monitor erroring never blocks the rest.
 *
 * `source` is who asked: the scheduler only runs due checks ("scheduled");
 * an operator run is "manual" when the check was due and "retry" when it was not.
 */
export async function runMonitorsBatch(
  monitors: Monitor[],
  concurrency = 6,
  source: "scheduler" | "operator" = "operator",
): Promise<BatchSummary> {
  const summary: BatchSummary = {
    checked: 0,
    ok: 0,
    failed: 0,
    unknown: 0,
    opened: 0,
    resolved: 0,
    retries: 0,
  };
  let cursor = 0;
  const now = new Date();

  async function worker() {
    while (cursor < monitors.length) {
      const monitor = monitors[cursor++]!;
      try {
        const due = isMonitorDue(monitor.lastCheckAt, monitor.cadenceMinutes, now);
        const trigger: CheckTrigger = source === "scheduler" ? "scheduled" : due ? "manual" : "retry";
        const result = await runMonitorCheck(monitor);
        const outcome = await recordCheckResult(monitor, result, { trigger });
        summary.checked++;
        if (trigger === "retry") summary.retries++;
        if (result.status === "ok") summary.ok++;
        else if (result.status === "fail") summary.failed++;
        else summary.unknown++;
        if (outcome.action === "incident_opened") summary.opened++;
        if (outcome.action === "incident_resolved") summary.resolved++;
      } catch {
        summary.unknown++;
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, monitors.length); i++) workers.push(worker());
  await Promise.all(workers);
  return summary;
}
