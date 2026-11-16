/**
 * The single shared definition of check state, pass rate and uptime.
 * Dashboard, Monitoring, Client Health and Delivery all read these functions,
 * so their numbers reconcile by construction. Pure: no DB, no clock except the
 * `now` argument.
 *
 * States
 *  - passing     latest measurement passed and is still fresh
 *  - failing     latest measurement failed (stays failing until a pass, however old)
 *  - unmeasured  the probe ran but could not measure (provider/quota/tooling)
 *  - stale       the latest pass / unmeasured result is older than the freshness window
 *  - never_run   enabled but no observation yet
 *  - disabled    switched off; excluded from every rate
 */
export type CheckState = "passing" | "failing" | "unmeasured" | "stale" | "never_run" | "disabled";

export interface CheckLike {
  enabled: boolean;
  type: string;
  lastStatus: string | null;
  lastCheckAt: Date | null;
  cadenceMinutes: number;
}

/** Event-driven checks (no schedule) never go stale by age alone. */
const EVENT_DRIVEN: Record<string, true> = { LEAD_ROUTE: true, CUSTOM: true };

/** A result is fresh for 3 cadences, and never less than 60 minutes. */
export function freshnessWindowMs(cadenceMinutes: number): number {
  return Math.max(cadenceMinutes * 3, 60) * 60_000;
}

export function checkState(m: CheckLike, now: Date = new Date()): CheckState {
  if (!m.enabled) return "disabled";
  if (!m.lastCheckAt || !m.lastStatus) return "never_run";
  if (m.lastStatus === "fail") return "failing";
  const age = now.getTime() - m.lastCheckAt.getTime();
  if (!EVENT_DRIVEN[m.type] && age > freshnessWindowMs(m.cadenceMinutes)) return "stale";
  return m.lastStatus === "ok" ? "passing" : "unmeasured";
}

export interface CheckSummary {
  total: number;
  /** Enabled checks (everything except disabled). */
  eligible: number;
  passing: number;
  failing: number;
  unmeasured: number;
  stale: number;
  neverRun: number;
  disabled: number;
  /** passing + failing: the denominator of the pass rate. */
  measured: number;
  /** Percentage of measured checks that passed; null when nothing is measured. */
  passRatePct: number | null;
}

export function summarizeChecks(monitors: CheckLike[], now: Date = new Date()): CheckSummary {
  const s: CheckSummary = {
    total: monitors.length,
    eligible: 0,
    passing: 0,
    failing: 0,
    unmeasured: 0,
    stale: 0,
    neverRun: 0,
    disabled: 0,
    measured: 0,
    passRatePct: null,
  };
  monitors.forEach((m) => {
    const st = checkState(m, now);
    if (st === "disabled") s.disabled++;
    else {
      s.eligible++;
      if (st === "passing") s.passing++;
      else if (st === "failing") s.failing++;
      else if (st === "unmeasured") s.unmeasured++;
      else if (st === "stale") s.stale++;
      else s.neverRun++;
    }
  });
  s.measured = s.passing + s.failing;
  s.passRatePct = s.measured ? Math.round((s.passing / s.measured) * 100) : null;
  return s;
}

/** "8 of 9 measured checks passed · 1 not measured · 2 stale" */
export function passRateLabel(s: CheckSummary): string {
  const parts: string[] = [];
  parts.push(s.measured ? `${s.passing} of ${s.measured} measured checks passed` : "No checks measured yet");
  if (s.unmeasured) parts.push(`${s.unmeasured} not measured`);
  if (s.stale) parts.push(`${s.stale} stale`);
  if (s.neverRun) parts.push(`${s.neverRun} never run`);
  if (s.disabled) parts.push(`${s.disabled} disabled`);
  return parts.join(" · ");
}

/** Empty-state copy for "no open incidents", derived from the actual records. */
export function noIncidentsCopy(s: CheckSummary): { title: string; description: string } {
  if (s.total === 0) {
    return { title: "No checks yet", description: "Add a website to start monitoring it." };
  }
  if (s.eligible === 0) {
    return { title: "No open incidents", description: "Every check is disabled, so nothing is being measured." };
  }
  if (s.failing === 0 && s.unmeasured === 0 && s.stale === 0 && s.neverRun === 0) {
    return {
      title: "No open incidents",
      description: `All ${s.passing} eligible checks passed at their latest run.`,
    };
  }
  const gaps: string[] = [];
  if (s.failing) gaps.push(`${s.failing} failing below its confirmation threshold`);
  if (s.unmeasured) gaps.push(`${s.unmeasured} could not be measured`);
  if (s.stale) gaps.push(`${s.stale} stale`);
  if (s.neverRun) gaps.push(`${s.neverRun} never run`);
  return {
    title: "No open incidents",
    description: `${s.passing} of ${s.eligible} eligible checks are passing and fresh; ${gaps.join(", ")}.`,
  };
}

// ---- uptime ----------------------------------------------------------------
export interface UptimeObservation {
  status: string;
  observedAt: Date;
}

export interface UptimeSummary {
  windowHours: number;
  ok: number;
  fail: number;
  /** null when there are too few observations to state a percentage. */
  pct: number | null;
  minObservations: number;
}

/**
 * Uptime is only stated from real uptime observations inside a named window.
 * Unmeasured observations are excluded; below `minObservations` it is unavailable.
 */
export function computeUptime(
  observations: UptimeObservation[],
  windowHours = 24,
  now: Date = new Date(),
  minObservations = 4,
): UptimeSummary {
  const from = now.getTime() - windowHours * 3_600_000;
  let ok = 0;
  let fail = 0;
  observations.forEach((o) => {
    const t = o.observedAt.getTime();
    if (t < from || t > now.getTime()) return;
    if (o.status === "ok") ok++;
    else if (o.status === "fail") fail++;
  });
  const n = ok + fail;
  return {
    windowHours,
    ok,
    fail,
    pct: n >= minObservations ? Math.round((ok / n) * 1000) / 10 : null,
    minObservations,
  };
}

export function uptimeLabel(u: UptimeSummary): { value: string; hint: string } {
  const n = u.ok + u.fail;
  if (u.pct === null) {
    return {
      value: "Unavailable",
      hint: `${n} uptime observation${n === 1 ? "" : "s"} in the last ${u.windowHours}h; ${u.minObservations} needed`,
    };
  }
  return { value: `${u.pct}%`, hint: `${u.ok} of ${n} uptime observations passed in the last ${u.windowHours}h` };
}

// ---- outcome feedback --------------------------------------------------------
export type RecordAction =
  | "none"
  | "failure_unconfirmed"
  | "maintenance"
  | "incident_opened"
  | "incident_occurrence"
  | "incident_retry"
  | "incident_resolved";

/** Human feedback for a recorded check: actual outcome, time and next action. */
export function describeOutcome(input: {
  status: "ok" | "fail" | "unknown";
  detail?: string | null;
  action: RecordAction;
  observedAt: Date;
  consecutiveFailures?: number;
  confirmAfter?: number;
}): string {
  const time = input.observedAt.toISOString().slice(11, 16) + " UTC";
  const detail = input.detail ? ` ${input.detail}.` : "";
  if (input.status === "unknown") {
    return `Could not be measured at ${time}.${detail} Next: fix the measurement source, then run the check again.`;
  }
  if (input.status === "ok") {
    return input.action === "incident_resolved"
      ? `Passed at ${time}.${detail} The open incident was resolved; confirm the linked task and close it.`
      : `Passed at ${time}.${detail} No action needed.`;
  }
  switch (input.action) {
    case "incident_opened":
      return `Failed at ${time}.${detail} An incident was opened and a task created. Next: acknowledge the incident.`;
    case "incident_occurrence":
      return `Failed again at ${time}.${detail} Added to the existing incident (no duplicate). Next: work the linked task.`;
    case "incident_retry":
      return `Still failing at ${time}.${detail} This re-run was a retry inside the same check window, so it was not counted as a new occurrence.`;
    case "failure_unconfirmed":
      return `Failed at ${time}.${detail} Failure ${input.consecutiveFailures ?? 1} of ${input.confirmAfter ?? 2} needed to confirm; no incident yet. Next: it is rechecked on the next run.`;
    case "maintenance":
      return `Failed at ${time}.${detail} The site is in a maintenance window, so no incident was opened.`;
    default:
      return `Failed at ${time}.${detail}`;
  }
}
