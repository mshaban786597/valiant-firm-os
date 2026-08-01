import { describe, expect, it } from "vitest";
import { formatApiLog, withApiLogging } from "@/lib/api-logger";

describe("formatApiLog", () => {
  it("emits a compact JSON line with core fields", () => {
    const parsed = JSON.parse(
      formatApiLog({ method: "GET", path: "/api/leads", status: 200, durationMs: 12 }),
    );
    expect(parsed).toMatchObject({
      kind: "api",
      method: "GET",
      path: "/api/leads",
      status: 200,
      durationMs: 12,
    });
    expect(parsed.orgId).toBeUndefined();
  });

  it("includes orgId and error only when present", () => {
    const parsed = JSON.parse(
      formatApiLog({
        method: "POST",
        path: "/api/x",
        status: 500,
        durationMs: 5,
        organizationId: "org_1",
        error: "PrismaError",
      }),
    );
    expect(parsed.orgId).toBe("org_1");
    expect(parsed.error).toBe("PrismaError");
  });
});

describe("withApiLogging", () => {
  it("passes through a normal response", async () => {
    const wrapped = withApiLogging(async () => new Response("ok", { status: 201 }));
    const res = await wrapped(new Request("http://localhost/api/test"));
    expect(res.status).toBe(201);
  });

  it("converts a thrown error into a sanitized 500 (no leak)", async () => {
    const wrapped = withApiLogging(async () => {
      throw new Error("db exploded with secret details");
    });
    const res = await wrapped(new Request("http://localhost/api/boom"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
