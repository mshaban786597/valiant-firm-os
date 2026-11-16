import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma + onboarding so the handoff logic is exercised without a DB.
const { clientCreate, clientDelete, dealUpdateMany, dealFindUnique, leadUpdate, ensureChecklist } =
  vi.hoisted(() => ({
    clientCreate: vi.fn(),
    clientDelete: vi.fn(),
    dealUpdateMany: vi.fn(),
    dealFindUnique: vi.fn(),
    leadUpdate: vi.fn(),
    ensureChecklist: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: { create: clientCreate, delete: clientDelete },
    deal: { updateMany: dealUpdateMany, findUnique: dealFindUnique },
    lead: { update: leadUpdate },
  },
}));
vi.mock("@/lib/onboarding", () => ({ ensureOnboardingChecklist: ensureChecklist }));

import { completeDealWonHandoff } from "@/lib/deal-handoff";

const baseDeal = {
  id: "deal_1",
  businessName: "Acme Gutters",
  contactName: "Jordan",
  serviceInterest: "Local SEO",
  monthlyValue: null,
  leadId: "lead_1",
  clientId: null,
};

describe("completeDealWonHandoff (G05)", () => {
  beforeEach(() => {
    clientCreate.mockReset().mockResolvedValue({ id: "client_new" });
    clientDelete.mockReset().mockResolvedValue({});
    dealUpdateMany.mockReset();
    dealFindUnique.mockReset();
    leadUpdate.mockReset().mockResolvedValue({});
    ensureChecklist.mockReset().mockResolvedValue(undefined);
  });

  it("fast-paths when the deal already has a client (idempotent replay)", async () => {
    const res = await completeDealWonHandoff({
      organizationId: "org_1",
      deal: { ...baseDeal, clientId: "client_existing" },
    });
    expect(res).toEqual({ created: false, clientId: "client_existing", reason: "already-linked" });
    expect(clientCreate).not.toHaveBeenCalled();
    expect(ensureChecklist).not.toHaveBeenCalled();
  });

  it("creates exactly one client + onboarding when it wins the claim", async () => {
    dealUpdateMany.mockResolvedValue({ count: 1 });
    const res = await completeDealWonHandoff({ organizationId: "org_1", deal: baseDeal });
    expect(res).toEqual({ created: true, clientId: "client_new", reason: "created" });
    expect(clientCreate).toHaveBeenCalledTimes(1);
    expect(dealUpdateMany).toHaveBeenCalledWith({
      where: { id: "deal_1", clientId: null },
      data: { clientId: "client_new" },
    });
    expect(ensureChecklist).toHaveBeenCalledWith("org_1", "client_new");
    expect(leadUpdate).toHaveBeenCalledTimes(1);
    expect(clientDelete).not.toHaveBeenCalled();
  });

  it("rolls back the orphan and returns the winner when it loses the race", async () => {
    dealUpdateMany.mockResolvedValue({ count: 0 }); // another writer already claimed it
    dealFindUnique.mockResolvedValue({ clientId: "client_winner" });
    const res = await completeDealWonHandoff({ organizationId: "org_1", deal: baseDeal });
    expect(res).toEqual({ created: false, clientId: "client_winner", reason: "race-lost" });
    expect(clientDelete).toHaveBeenCalledWith({ where: { id: "client_new" } });
    expect(ensureChecklist).not.toHaveBeenCalled(); // no duplicate onboarding
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("two concurrent closes produce only one onboarding (simulated)", async () => {
    // First writer wins, second loses — only one ensureOnboardingChecklist.
    dealUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    dealFindUnique.mockResolvedValue({ clientId: "client_new" });
    clientCreate.mockResolvedValueOnce({ id: "client_A" }).mockResolvedValueOnce({ id: "client_B" });

    const [a, b] = await Promise.all([
      completeDealWonHandoff({ organizationId: "org_1", deal: baseDeal }),
      completeDealWonHandoff({ organizationId: "org_1", deal: baseDeal }),
    ]);

    const created = [a, b].filter((r) => r.created);
    expect(created).toHaveLength(1);
    expect(ensureChecklist).toHaveBeenCalledTimes(1);
  });
});
