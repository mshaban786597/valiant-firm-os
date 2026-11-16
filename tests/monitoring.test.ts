import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorType } from "@prisma/client";
import {
  buildFingerprint,
  defaultSeverity,
  isMonitorDue,
} from "@/lib/monitoring/fingerprint";

// ---- pure helpers -------------------------------------------------------
describe("incident fingerprint + severity", () => {
  it("is deterministic and normalized", () => {
    expect(buildFingerprint("M1", "Uptime", "https://X.com")).toBe(
      buildFingerprint("m1", "uptime", "https://x.com"),
    );
    expect(buildFingerprint("m1", "uptime", "a")).not.toBe(
      buildFingerprint("m1", "uptime", "b"),
    );
  });
  it("maps monitor type to a sensible default severity", () => {
    expect(defaultSeverity(MonitorType.UPTIME)).toBe("CRITICAL");
    expect(defaultSeverity(MonitorType.ROUTE)).toBe("WARNING");
    expect(defaultSeverity(MonitorType.CUSTOM)).toBe("INFO");
  });
  it("respects cadence for due calculation", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(isMonitorDue(null, 15, now)).toBe(true);
    expect(isMonitorDue(new Date("2026-01-01T11:40:00Z"), 15, now)).toBe(true);
    expect(isMonitorDue(new Date("2026-01-01T11:50:00Z"), 15, now)).toBe(false);
  });
});

// ---- incident lifecycle (mocked prisma) ---------------------------------
const p = vi.hoisted(() => ({
  monitorCheck: { create: vi.fn() },
  monitor: { update: vi.fn() },
  incident: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  incidentEvent: { create: vi.fn() },
  task: { create: vi.fn() },
  founderAlert: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: p }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

import { recordCheckResult } from "@/lib/monitoring/incidents";

const monitor = {
  id: "mon_1",
  organizationId: "org_1",
  clientId: "client_1",
  name: "Acme uptime",
  type: MonitorType.UPTIME,
  target: "https://acme.test",
};

describe("recordCheckResult lifecycle", () => {
  beforeEach(() => {
    Object.values(p).forEach((m) => Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset()));
    p.monitorCheck.create.mockResolvedValue({ id: "chk_1" });
    p.monitor.update.mockResolvedValue({});
    p.incident.create.mockResolvedValue({ id: "inc_1" });
    p.incident.update.mockResolvedValue({});
    p.incidentEvent.create.mockResolvedValue({});
    p.task.create.mockResolvedValue({ id: "task_1" });
    p.founderAlert.create.mockResolvedValue({});
  });

  it("opens one incident + task + alert on first failure", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const r = await recordCheckResult(monitor, { status: "fail", detail: "down", statusCode: 500 });
    expect(r.action).toBe("incident_opened");
    expect(p.incident.create).toHaveBeenCalledTimes(1);
    expect(p.task.create).toHaveBeenCalledTimes(1); // one delivery task
    expect(p.founderAlert.create).toHaveBeenCalledTimes(1); // critical → alert
  });

  it("folds a repeat failure into the existing incident (no new incident)", async () => {
    p.incident.findFirst.mockResolvedValue({ id: "inc_existing" });
    const r = await recordCheckResult(monitor, { status: "fail", detail: "still down" });
    expect(r.action).toBe("incident_occurrence");
    expect(r.incidentId).toBe("inc_existing");
    expect(p.incident.create).not.toHaveBeenCalled();
    expect(p.task.create).not.toHaveBeenCalled(); // no duplicate task
  });

  it("auto-resolves the open incident on a recovery (ok) check", async () => {
    p.incident.findFirst.mockResolvedValue({ id: "inc_open" });
    const r = await recordCheckResult(monitor, { status: "ok", detail: "HTTP 200" });
    expect(r.action).toBe("incident_resolved");
    expect(p.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inc_open" } }),
    );
  });

  it("does nothing special when healthy with no open incident", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const r = await recordCheckResult(monitor, { status: "ok" });
    expect(r.action).toBe("none");
  });
});
