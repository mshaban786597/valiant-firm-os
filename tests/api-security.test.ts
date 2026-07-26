import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth + prisma so we exercise the real route handlers offline.
// vi.hoisted keeps these fns available inside the hoisted vi.mock factories.
const { getServerSession, findMany, create } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findMany, create },
    auditLog: { create: vi.fn() },
  },
}));

import { GET, POST } from "@/app/api/leads/route";

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("API security — /api/leads", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    findMany.mockReset().mockResolvedValue([]);
    create.mockReset();
  });

  it("returns 401 for an unauthenticated GET", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/leads"));
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated POST", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(
      req("http://localhost/api/leads", {
        method: "POST",
        body: JSON.stringify({ businessName: "x", niche: "y", city: "c", state: "s" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no organizationId", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } }); // no org
    const res = await GET(req("http://localhost/api/leads"));
    expect(res.status).toBe(401);
  });

  it("scopes every query to the caller's organization (tenant isolation)", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "u1" },
      organizationId: "org_A",
    });
    const res = await GET(req("http://localhost/api/leads?q=acme"));
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    const where = findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org_A");
    // A caller in org_A can never widen the query to another org.
    expect(where.organizationId).not.toBe("org_B");
  });

  it("rejects an invalid POST payload with 400 (after auth passes)", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "u1" },
      organizationId: "org_A",
    });
    const res = await POST(
      req("http://localhost/api/leads", {
        method: "POST",
        body: JSON.stringify({ niche: "only-niche" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
