import { describe, expect, it } from "vitest";
import { LeadStatus } from "@prisma/client";
import { actionSchema, workflowCreateSchema } from "@/lib/automations/types";
import { eligibleAssignees, pickAssignee } from "@/lib/automations/assign";

describe("workflow action validation", () => {
  it("accepts a well-formed create_task action", () => {
    const res = actionSchema.safeParse({
      type: "create_task",
      config: { title: "Kickoff call", priority: "High" },
    });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown action type", () => {
    const res = actionSchema.safeParse({ type: "delete_everything", config: {} });
    expect(res.success).toBe(false);
  });

  it("rejects update_lead_status with an invalid status", () => {
    const res = actionSchema.safeParse({
      type: "update_lead_status",
      config: { status: "NotARealStatus" },
    });
    expect(res.success).toBe(false);
  });

  it("accepts a valid workflow with a known trigger", () => {
    const res = workflowCreateSchema.safeParse({
      name: "Onboard won deals",
      trigger: "deal_won",
      actions: [{ type: "create_task", config: { title: "Send welcome kit" } }],
    });
    expect(res.success).toBe(true);
  });

  it("rejects a workflow with an unknown trigger", () => {
    const res = workflowCreateSchema.safeParse({
      name: "x",
      trigger: "phase_of_the_moon",
      actions: [],
    });
    expect(res.success).toBe(false);
  });

  it("accepts update_lead_status with a real LeadStatus", () => {
    const res = actionSchema.safeParse({
      type: "update_lead_status",
      config: { status: LeadStatus.OutreachQueue },
    });
    expect(res.success).toBe(true);
  });
});

describe("lead assignment", () => {
  const members = [
    { userId: "founder", roleKey: "FOUNDER" },
    { userId: "sales1", roleKey: "SALES" },
    { userId: "sales2", roleKey: "SALES" },
    { userId: "viewer", roleKey: "VIEWER" },
    { userId: "unknown", roleKey: "NOPE" },
  ];

  it("only considers members who can write leads", () => {
    const eligible = eligibleAssignees(members).map((m) => m.userId);
    expect(eligible).toContain("sales1");
    expect(eligible).toContain("founder");
    expect(eligible).not.toContain("viewer");
    expect(eligible).not.toContain("unknown");
  });

  it("is deterministic for the same seed and returns an eligible member", () => {
    const a = pickAssignee(members, "lead-123");
    const b = pickAssignee(members, "lead-123");
    expect(a).toBe(b);
    expect(eligibleAssignees(members).map((m) => m.userId)).toContain(a);
  });

  it("returns null when nobody is eligible", () => {
    expect(pickAssignee([{ userId: "v", roleKey: "VIEWER" }], "seed")).toBeNull();
    expect(pickAssignee([], "seed")).toBeNull();
  });
});
