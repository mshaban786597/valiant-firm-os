import { describe, expect, it } from "vitest";
import { ClientStatus } from "@prisma/client";
import { CLIENT_TRANSITIONS, canTransition, nextStates } from "@/lib/status";

describe("client lifecycle transitions", () => {
  it("onboards then activates", () => {
    expect(
      canTransition(CLIENT_TRANSITIONS, ClientStatus.Onboarding, ClientStatus.Active),
    ).toBe(true);
  });

  it("moves an active client to at-risk and back", () => {
    expect(canTransition(CLIENT_TRANSITIONS, ClientStatus.Active, ClientStatus.AtRisk)).toBe(true);
    expect(canTransition(CLIENT_TRANSITIONS, ClientStatus.AtRisk, ClientStatus.Active)).toBe(true);
  });

  it("can churn from any live state", () => {
    for (const state of [
      ClientStatus.Onboarding,
      ClientStatus.Active,
      ClientStatus.AtRisk,
      ClientStatus.Paused,
    ]) {
      expect(canTransition(CLIENT_TRANSITIONS, state, ClientStatus.Churned)).toBe(true);
    }
  });

  it("does not silently reactivate a churned client to Active", () => {
    expect(canTransition(CLIENT_TRANSITIONS, ClientStatus.Churned, ClientStatus.Active)).toBe(false);
    // A returning client must re-enter through Onboarding.
    expect(
      canTransition(CLIENT_TRANSITIONS, ClientStatus.Churned, ClientStatus.Onboarding),
    ).toBe(true);
  });

  it("forbids skipping onboarding straight to at-risk", () => {
    expect(
      canTransition(CLIENT_TRANSITIONS, ClientStatus.Onboarding, ClientStatus.AtRisk),
    ).toBe(false);
  });

  it("every status has a defined (possibly empty) transition set", () => {
    for (const status of Object.values(ClientStatus)) {
      expect(Array.isArray(nextStates(CLIENT_TRANSITIONS, status))).toBe(true);
    }
  });
});
