import { IncidentSeverity, MonitorType } from "@prisma/client";

/**
 * Deterministic incident fingerprint. Incidents are deduplicated by
 * (monitor, check kind, affected object) so repeated failures of the same thing
 * fold into one incident with an occurrence count — never a new incident each
 * time. Pure + stable so the same failure always maps to the same fingerprint.
 */
export function buildFingerprint(
  monitorId: string,
  checkKind: string,
  affectedObject: string,
): string {
  return [monitorId, checkKind, affectedObject]
    .map((p) => p.trim().toLowerCase())
    .join("|");
}

/** Default severity by monitor type (overridable per incident). */
export function defaultSeverity(type: MonitorType | string): IncidentSeverity {
  switch (type) {
    case "SSL_EXPIRY":
    case "FORM":
      return IncidentSeverity.CRITICAL;
    case "SITE_CRAWL":
    case "RESPONSE_TIME":
      return IncidentSeverity.WARNING;
    case MonitorType.UPTIME:
    case MonitorType.LEAD_ROUTE:
    case MonitorType.DNS:
    case MonitorType.INDEXING:
      return IncidentSeverity.CRITICAL;
    case MonitorType.TLS:
    case MonitorType.ROUTE:
    case MonitorType.PAGE_SPEED:
    case MonitorType.BROKEN_LINKS:
    case MonitorType.SECURITY:
    case MonitorType.MOBILE:
      return IncidentSeverity.WARNING;
    default:
      return IncidentSeverity.INFO;
  }
}

/** Is a monitor due to run, given its cadence and last check time? */
export function isMonitorDue(
  lastCheckAt: Date | null,
  cadenceMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!lastCheckAt) return true;
  return now.getTime() - lastCheckAt.getTime() >= cadenceMinutes * 60_000;
}
