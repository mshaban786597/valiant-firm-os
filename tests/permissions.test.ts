import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  can,
  isPrivileged,
  permittedActions,
} from "@/lib/permissions";

describe("RBAC can()", () => {
  it("grants FOUNDER and ADMIN every action", () => {
    for (const action of ACTIONS) {
      expect(can("FOUNDER", action)).toBe(true);
      expect(can("ADMIN", action)).toBe(true);
    }
  });

  it("denies unknown/missing roles everything (safe default)", () => {
    expect(can(undefined, "lead.read")).toBe(false);
    expect(can(null, "lead.read")).toBe(false);
    expect(can("NOT_A_ROLE", "lead.read")).toBe(false);
    expect(can("", "lead.read")).toBe(false);
  });

  it("makes VIEWER strictly read-only", () => {
    expect(can("VIEWER", "lead.read")).toBe(true);
    expect(can("VIEWER", "report.read")).toBe(true);
    expect(can("VIEWER", "lead.write")).toBe(false);
    expect(can("VIEWER", "report.send")).toBe(false);
    expect(can("VIEWER", "org.members")).toBe(false);
  });

  it("scopes SALES to leads and pipeline", () => {
    expect(can("SALES", "lead.write")).toBe(true);
    expect(can("SALES", "deal.write")).toBe(true);
    expect(can("SALES", "client.write")).toBe(false);
    expect(can("SALES", "invoice.write")).toBe(false);
  });

  it("lets MANAGER run delivery/billing but not own the org", () => {
    expect(can("MANAGER", "invoice.write")).toBe(true);
    expect(can("MANAGER", "report.send")).toBe(true);
    expect(can("MANAGER", "org.members")).toBe(false);
    expect(can("MANAGER", "org.settings")).toBe(false);
  });

  it("limits STAFF and specialists to task/report work", () => {
    expect(can("STAFF", "task.write")).toBe(true);
    expect(can("STAFF", "lead.write")).toBe(false);
    expect(can("SEO_SPECIALIST", "report.write")).toBe(true);
    expect(can("SEO_SPECIALIST", "invoice.write")).toBe(false);
    expect(can("ADS_SPECIALIST", "task.write")).toBe(true);
  });

  it("never grants a write without the matching read", () => {
    const writeToRead: Record<string, string> = {
      "lead.write": "lead.read",
      "deal.write": "deal.read",
      "client.write": "client.read",
      "task.write": "task.read",
      "report.write": "report.read",
      "invoice.write": "invoice.read",
      "automation.write": "automation.read",
    };
    for (const role of ["MANAGER", "OPS", "SALES", "STAFF", "SEO_SPECIALIST"]) {
      for (const [write, read] of Object.entries(writeToRead)) {
        if (can(role, write as never)) {
          expect(can(role, read as never)).toBe(true);
        }
      }
    }
  });
});

describe("permittedActions() / isPrivileged()", () => {
  it("expands wildcard roles to the full action list", () => {
    expect(permittedActions("FOUNDER").sort()).toEqual([...ACTIONS].sort());
  });

  it("returns nothing for unknown roles", () => {
    expect(permittedActions("NOPE")).toEqual([]);
  });

  it("flags only wildcard roles as privileged", () => {
    expect(isPrivileged("FOUNDER")).toBe(true);
    expect(isPrivileged("ADMIN")).toBe(true);
    expect(isPrivileged("MANAGER")).toBe(false);
    expect(isPrivileged("VIEWER")).toBe(false);
  });
});
