import { describe, expect, it } from "vitest";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MINUTES,
  isLockedOut,
  windowStart,
} from "@/lib/rate-limit";

describe("login lockout policy", () => {
  it("locks out at or above the failure threshold", () => {
    expect(isLockedOut(0)).toBe(false);
    expect(isLockedOut(LOGIN_MAX_FAILURES - 1)).toBe(false);
    expect(isLockedOut(LOGIN_MAX_FAILURES)).toBe(true);
    expect(isLockedOut(LOGIN_MAX_FAILURES + 3)).toBe(true);
  });

  it("respects a custom max", () => {
    expect(isLockedOut(2, 3)).toBe(false);
    expect(isLockedOut(3, 3)).toBe(true);
  });

  it("computes the window start correctly", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const start = windowStart(now);
    expect(now.getTime() - start.getTime()).toBe(LOGIN_WINDOW_MINUTES * 60_000);
  });
});
