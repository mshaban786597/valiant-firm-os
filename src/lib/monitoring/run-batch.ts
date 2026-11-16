import type { Monitor } from "@prisma/client";
import { runMonitorCheck } from "@/lib/monitoring/runner";
import { recordCheckResult } from "@/lib/monitoring/incidents";

export interface BatchSummary {
  checked: number;
  ok: number;
  failed: number;
  unknown: number;
  opened: number;
  resolved: number;
}

/**
 * Run a set of monitors with bounded concurrency and drive the incident
 * lifecycle for each. One monitor erroring never blocks the rest.
 */
export async function runMonitorsBatch(monitors: Monitor[], concurrency = 6): Promise<BatchSummary> {
  const summary: BatchSummary = { checked: 0, ok: 0, failed: 0, unknown: 0, opened: 0, resolved: 0 };
  let cursor = 0;

  async function worker() {
    while (cursor < monitors.length) {
      const monitor = monitors[cursor++]!;
      try {
        const result = await runMonitorCheck(monitor);
        const outcome = await recordCheckResult(monitor, result);
        summary.checked++;
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
