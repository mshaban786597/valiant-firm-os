import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorType, Prisma } from "@prisma/client";
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
  task: { create: vi.fn(), updateMany: vi.fn() },
  founderAlert: { create: vi.fn(), updateMany: vi.fn() },
}));
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: p }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({ notify: notifyMock }));

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
    notifyMock.mockReset();
    notifyMock.mockResolvedValue([]);
    p.monitorCheck.create.mockResolvedValue({ id: "chk_1" });
    p.monitor.update.mockResolvedValue({});
    p.incident.create.mockResolvedValue({ id: "inc_1" });
    p.incident.update.mockResolvedValue({});
    p.incidentEvent.create.mockResolvedValue({});
    p.task.create.mockResolvedValue({ id: "task_1" });
    p.task.updateMany.mockResolvedValue({ count: 1 });
    p.founderAlert.create.mockResolvedValue({});
    p.founderAlert.updateMany.mockResolvedValue({ count: 1 });
  });

  it("opens one incident + task + linked alert + one notification on first failure", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const r = await recordCheckResult(monitor, { status: "fail", detail: "down", statusCode: 500 });
    expect(r.action).toBe("incident_opened");
    expect(p.incident.create).toHaveBeenCalledTimes(1);
    expect(p.task.create).toHaveBeenCalledTimes(1);
    expect(p.founderAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ incidentId: "inc_1" }) }),
    );
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("folds a repeat failure into the existing incident: no new incident, task or notification", async () => {
    p.incident.findFirst.mockResolvedValue({ id: "inc_existing", taskId: "task_1" });
    const r = await recordCheckResult(monitor, { status: "fail", detail: "still down" });
    expect(r.action).toBe("incident_occurrence");
    expect(r.incidentId).toBe("inc_existing");
    expect(p.incident.create).not.toHaveBeenCalled();
    expect(p.task.create).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("records a retry without counting it as a new occurrence", async () => {
    p.incident.findFirst.mockResolvedValue({ id: "inc_existing", taskId: null });
    const r = await recordCheckResult(monitor, { status: "fail" }, { trigger: "retry" });
    expect(r.action).toBe("incident_retry");
    expect(p.incident.update).not.toHaveBeenCalled(); // occurrenceCount untouched
    expect(p.monitorCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trigger: "retry" }) }),
    );
  });

  it("a failure first seen on a re-run still opens the incident (and a retry never extends a streak)", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const first = await recordCheckResult({ ...monitor, consecutiveFailures: 0 }, { status: "fail" }, { trigger: "retry" });
    expect(first.action).toBe("incident_opened");

    p.incident.findFirst.mockResolvedValue(null);
    const blip = await recordCheckResult(
      { ...monitor, confirmAfter: 2, consecutiveFailures: 1 },
      { status: "fail" },
      { trigger: "retry" },
    );
    expect(blip.action).toBe("failure_unconfirmed");
    expect(blip.consecutiveFailures).toBe(1); // the retry did not confirm it
  });

  it("waits for the confirmation threshold before opening an incident", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const first = await recordCheckResult(
      { ...monitor, confirmAfter: 2, consecutiveFailures: 0 },
      { status: "fail", detail: "blip" },
    );
    expect(first.action).toBe("failure_unconfirmed");
    expect(first.consecutiveFailures).toBe(1);
    expect(p.incident.create).not.toHaveBeenCalled();

    const second = await recordCheckResult(
      { ...monitor, confirmAfter: 2, consecutiveFailures: 1 },
      { status: "fail", detail: "still failing" },
    );
    expect(second.action).toBe("incident_opened");
  });

  it("does not open an incident during a maintenance window", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const r = await recordCheckResult(
      { ...monitor, maintenanceUntil: new Date(Date.now() + 3_600_000) },
      { status: "fail" },
    );
    expect(r.action).toBe("maintenance");
    expect(p.incident.create).not.toHaveBeenCalled();
  });

  it("an unmeasured check never opens or resolves anything", async () => {
    p.incident.findFirst.mockResolvedValue({ id: "inc_open", taskId: null });
    const r = await recordCheckResult(monitor, { status: "unknown", detail: "quota" });
    expect(r.action).toBe("none");
    expect(p.incident.findFirst).not.toHaveBeenCalled();
    expect(p.incident.update).not.toHaveBeenCalled();
  });

  it("recovers: resolves the incident, turns the alert into history, moves the task to QA", async () => {
    p.incident.findFirst.mockResolvedValue({ id: "inc_open", taskId: "task_9" });
    const r = await recordCheckResult(monitor, { status: "ok", detail: "HTTP 200" });
    expect(r.action).toBe("incident_resolved");
    expect(p.incident.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inc_open" } }));
    expect(p.founderAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { incidentId: "inc_open", resolvedAt: null } }),
    );
    expect(p.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "task_9" }) }),
    );
  });

  it("does nothing special when healthy with no open incident", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    const r = await recordCheckResult(monitor, { status: "ok" });
    expect(r.action).toBe("none");
  });

  it("treats a concurrent open (unique violation) as an occurrence, not a second incident", async () => {
    p.incident.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "inc_winner", taskId: null });
    p.incident.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );
    const r = await recordCheckResult(monitor, { status: "fail" });
    expect(r.action).toBe("incident_occurrence");
    expect(r.incidentId).toBe("inc_winner");
    expect(p.task.create).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("keeps demo incidents in the demo scope and tells the notifier", async () => {
    p.incident.findFirst.mockResolvedValue(null);
    await recordCheckResult({ ...monitor, isDemo: true, environment: "fixture" }, { status: "fail" });
    expect(p.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDemo: true, environment: "fixture" }) }),
    );
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ isDemo: true }));
  });
});
