import { IncidentStatus, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeUptime,
  summarizeChecks,
  type CheckSummary,
  type UptimeSummary,
} from "@/lib/monitoring/state";

const OPEN = [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED];

export interface MonitoringSummary {
  scope: { isDemo: boolean; label: string; windowHours: number };
  checks: CheckSummary;
  uptime: UptimeSummary;
  /** Incidents currently OPEN or ACKNOWLEDGED. */
  openIncidents: number;
  /** Alerts tied to an open incident (or unlinked and undismissed). */
  activeAlerts: number;
  /** Alerts whose incident recovered, or that were dismissed: history only. */
  historicalAlerts: number;
  /** Incident-linked tasks whose incident is still open. */
  openIncidentTasks: number;
  /** Incident-linked tasks whose incident recovered but the task is not closed. */
  recoveredTasksAwaitingClosure: number;
  /** Open incidents with no task (monitor has no client to own one). */
  openIncidentsWithoutTask: number;
}

/**
 * One query path for the numbers shown on Dashboard, Monitoring, Client Health
 * and Delivery. Same scope + same window in, same counts out.
 */
export async function getMonitoringSummary(
  organizationId: string,
  isDemo: boolean,
  now: Date = new Date(),
  windowHours = 24,
): Promise<MonitoringSummary> {
  const since = new Date(now.getTime() - windowHours * 3_600_000);

  const [monitors, uptimeObs, incidents, activeAlerts, historicalAlerts] = await Promise.all([
    prisma.monitor.findMany({
      where: { organizationId, isDemo },
      select: { enabled: true, type: true, kind: true, lastStatus: true, lastCheckAt: true, cadenceMinutes: true },
    }),
    prisma.monitorCheck.findMany({
      where: {
        organizationId,
        observedAt: { gte: since },
        monitor: { type: "UPTIME", isDemo },
      },
      select: { status: true, observedAt: true },
    }),
    prisma.incident.findMany({
      where: { organizationId, isDemo, taskId: { not: null } },
      select: { status: true, taskId: true },
    }),
    prisma.founderAlert.count({
      where: { organizationId, isDemo, dismissed: false, resolvedAt: null },
    }),
    prisma.founderAlert.count({
      where: { organizationId, isDemo, OR: [{ dismissed: true }, { resolvedAt: { not: null } }] },
    }),
  ]);

  const [openIncidents, openWithoutTask] = await Promise.all([
    prisma.incident.count({ where: { organizationId, isDemo, status: { in: OPEN } } }),
    prisma.incident.count({ where: { organizationId, isDemo, status: { in: OPEN }, taskId: null } }),
  ]);

  const openTaskIds: string[] = [];
  const resolvedTaskIds: string[] = [];
  incidents.forEach((i) => {
    if (!i.taskId) return;
    if (i.status === IncidentStatus.RESOLVED) resolvedTaskIds.push(i.taskId);
    else openTaskIds.push(i.taskId);
  });
  const notClosed = { status: { not: TaskStatus.Completed } };
  const [openIncidentTasks, recoveredTasksAwaitingClosure] = await Promise.all([
    openTaskIds.length
      ? prisma.task.count({ where: { organizationId, id: { in: openTaskIds }, ...notClosed } })
      : Promise.resolve(0),
    resolvedTaskIds.length
      ? prisma.task.count({ where: { organizationId, id: { in: resolvedTaskIds }, ...notClosed } })
      : Promise.resolve(0),
  ]);

  return {
    scope: { isDemo, label: isDemo ? "Fixture data" : "Live data", windowHours },
    checks: summarizeChecks(
      monitors.map((m) => ({ ...m, type: m.kind ?? m.type })),
      now,
    ),
    uptime: computeUptime(uptimeObs, windowHours, now),
    openIncidents,
    activeAlerts,
    historicalAlerts,
    openIncidentTasks,
    recoveredTasksAwaitingClosure,
    openIncidentsWithoutTask: openWithoutTask,
  };
}
