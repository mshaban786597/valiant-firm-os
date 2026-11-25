import type { NotificationEvent } from "@/lib/notifications/dispatch";
import type { ProcessSummary } from "@/lib/outreach/engine";

export interface RunAlert {
  event: NotificationEvent;
  title: string;
  body?: string;
  severity?: "info" | "warning" | "critical";
}

const emails = (n: number) => `${n} email${n === 1 ? "" : "s"}`;

/**
 * Pure: the alerts one sending run deserves. Quiet when nothing happened, so a
 * run every 15 minutes does not fill the owner's phone.
 */
export function outreachRunAlerts(run: ProcessSummary, stillUnclear = 0): RunAlert[] {
  const alerts: RunAlert[] = [];
  if (run.sent > 0) {
    const held = run.heldDailyLimit > 0 ? ` ${emails(run.heldDailyLimit)} wait for the daily allowance.` : "";
    alerts.push({ event: "outreach_sent", title: `${emails(run.sent)} sent`, body: `Sent from your outreach mailbox.${held}` });
  }
  const unclear = run.needsReconcile + stillUnclear;
  if (run.failed > 0 || unclear > 0) {
    const parts: string[] = [];
    if (run.failed > 0) parts.push(`${emails(run.failed)} refused by the mail server`);
    if (unclear > 0) parts.push(`${emails(unclear)} with an unclear result (not retried, to avoid sending twice)`);
    alerts.push({
      event: "outreach_problem",
      title: parts.join("; "),
      body: "Open Outreach to see which emails and why.",
      severity: "warning",
    });
  }
  return alerts;
}
