import { describe, expect, it } from "vitest";
import { withConnectionPatience } from "@/lib/prisma";

describe("database connection settings", () => {
  it("adds wake-up time to a plain URL and to one that already has options", () => {
    expect(withConnectionPatience("postgresql://u:p@host/db")).toBe("postgresql://u:p@host/db?connect_timeout=30&pool_timeout=30");
    expect(withConnectionPatience("postgresql://u:p@host/db?sslmode=require")).toBe(
      "postgresql://u:p@host/db?sslmode=require&connect_timeout=30&pool_timeout=30",
    );
  });

  it("keeps a value that was set on purpose", () => {
    expect(withConnectionPatience("postgresql://u:p@host/db?connect_timeout=5")).toBe("postgresql://u:p@host/db?connect_timeout=5&pool_timeout=30");
    expect(withConnectionPatience("postgresql://u:p@host/db?sslmode=require&pool_timeout=10&connect_timeout=60")).toBe(
      "postgresql://u:p@host/db?sslmode=require&pool_timeout=10&connect_timeout=60",
    );
  });

  it("leaves a missing or non-Postgres URL alone", () => {
    expect(withConnectionPatience(undefined)).toBeUndefined();
    expect(withConnectionPatience("mysql://u:p@host/db")).toBe("mysql://u:p@host/db");
  });
});
