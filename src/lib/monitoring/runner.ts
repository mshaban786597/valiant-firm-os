import dns from "node:dns/promises";
import { MonitorType, type Monitor } from "@prisma/client";
import type { CheckResult } from "@/lib/monitoring/incidents";

type MonitorLike = Pick<Monitor, "type" | "target">;

/**
 * Execute a monitor's check and return a normalized result. Real HTTP/DNS
 * checks for UPTIME/ROUTE/TLS/DNS; LEAD_ROUTE/CUSTOM are driven by explicit
 * simulated results (e.g. the Client-Ops pilot's "broken lead route"), so the
 * runner returns a neutral note for them.
 */
export async function runMonitorCheck(monitor: MonitorLike): Promise<CheckResult> {
  const checkKind = monitor.type.toLowerCase();

  try {
    if (
      monitor.type === MonitorType.UPTIME ||
      monitor.type === MonitorType.ROUTE ||
      monitor.type === MonitorType.TLS
    ) {
      const url = monitor.target.startsWith("http")
        ? monitor.target
        : `https://${monitor.target}`;
      const started = Date.now();
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - started;
      const ok = res.status < 400;
      return {
        status: ok ? "ok" : "fail",
        statusCode: res.status,
        latencyMs,
        detail: ok ? `HTTP ${res.status} in ${latencyMs}ms` : `HTTP ${res.status}`,
        affectedObject: url,
        checkKind,
      };
    }

    if (monitor.type === MonitorType.DNS) {
      const host = monitor.target.replace(/^https?:\/\//, "").split("/")[0]!;
      const started = Date.now();
      const records = await dns.resolve(host);
      const latencyMs = Date.now() - started;
      const ok = records.length > 0;
      return {
        status: ok ? "ok" : "fail",
        latencyMs,
        detail: ok ? `Resolved ${records.length} record(s)` : "No DNS records",
        affectedObject: host,
        checkKind,
      };
    }

    // LEAD_ROUTE / CUSTOM — driven by simulated results.
    return {
      status: "ok",
      detail: "Manual/simulated check — no automated probe configured",
      affectedObject: monitor.target,
      checkKind,
    };
  } catch (err) {
    return {
      status: "fail",
      detail: err instanceof Error ? `${err.name}: ${err.message}` : "Check error",
      affectedObject: monitor.target,
      checkKind,
    };
  }
}
