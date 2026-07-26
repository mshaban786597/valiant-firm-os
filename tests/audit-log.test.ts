import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma client so writeAuditLog is exercised without a database.
// vi.hoisted keeps the mock fn available inside the hoisted vi.mock factory.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { create } },
}));

import { writeAuditLog } from "@/lib/audit";

describe("writeAuditLog", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: "audit_1" });
  });

  it("persists an audit row with the core fields", async () => {
    await writeAuditLog({
      organizationId: "org_1",
      userId: "user_1",
      action: "lead.create",
      entity: "Lead",
      entityId: "lead_1",
      meta: { source: "import" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      organizationId: "org_1",
      userId: "user_1",
      action: "lead.create",
      entity: "Lead",
      entityId: "lead_1",
      meta: { source: "import" },
    });
  });

  it("passes undefined (not null) for omitted optional fields", async () => {
    await writeAuditLog({
      organizationId: "org_1",
      action: "client.update",
      entity: "Client",
    });
    const { data } = create.mock.calls[0][0];
    expect(data.userId).toBeUndefined();
    expect(data.entityId).toBeUndefined();
    expect(data.meta).toBeUndefined();
  });

  it("is non-blocking: swallows database errors instead of throwing", async () => {
    create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      writeAuditLog({ organizationId: "org_1", action: "x", entity: "Y" }),
    ).resolves.toBeUndefined();
  });
});
