import { beforeEach, describe, expect, it, vi } from "vitest";

/** Records the filter each query was asked for, and answers from small tables. */
const { db, state } = vi.hoisted(() => {
  type Row = { id: string; organizationId: string; email: string | null; emailConsentAt: Date | null; clientId?: string | null };
  const state = {
    client: [] as Row[],
    contact: [] as Row[],
    lead: [] as Row[],
    wheres: [] as { table: string; where: Record<string, unknown> }[],
  };
  const table = (name: "client" | "contact" | "lead") => ({
    findMany: async ({ where }: { where: { organizationId: string; email: unknown; emailConsentAt: unknown } }) => {
      state.wheres.push({ table: name, where });
      // Honour the filter the code sent, so a missing consent filter would show up as extra rows.
      return state[name].filter(
        (r) =>
          r.organizationId === where.organizationId &&
          (where.email === undefined || r.email !== null) &&
          (where.emailConsentAt === undefined || r.emailConsentAt !== null),
      );
    },
    updateMany: async ({ where, data }: { where: { id: string; organizationId: string }; data: { emailConsentAt: Date | null } }) => {
      const hit = state[name].filter((r) => r.id === where.id && r.organizationId === where.organizationId);
      hit.forEach((r) => (r.emailConsentAt = data.emailConsentAt));
      return { count: hit.length };
    },
  });
  return { state, db: { client: table("client"), contact: table("contact"), lead: table("lead") } };
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { consentPermission, consentingAudience, nobodyAgreedMessage, setEmailConsent } from "@/lib/email/audience";

const AGREED = new Date("2026-11-01T00:00:00Z");

beforeEach(() => {
  state.client.length = 0;
  state.contact.length = 0;
  state.lead.length = 0;
  state.wheres.length = 0;
});

describe("who can be added to an email campaign", () => {
  it("adds only clients who agreed", async () => {
    state.client.push(
      { id: "c1", organizationId: "org1", email: "yes@example.com", emailConsentAt: AGREED },
      { id: "c2", organizationId: "org1", email: "no@example.com", emailConsentAt: null },
      { id: "c3", organizationId: "org1", email: null, emailConsentAt: AGREED },
      { id: "c4", organizationId: "other", email: "other@example.com", emailConsentAt: AGREED },
    );
    expect(await consentingAudience("clients", "org1")).toEqual([{ email: "yes@example.com", clientId: "c1" }]);
  });

  it("never adds a cold lead", async () => {
    state.lead.push(
      { id: "l1", organizationId: "org1", email: "cold@example.com", emailConsentAt: null },
      { id: "l2", organizationId: "org1", email: "warm@example.com", emailConsentAt: AGREED },
    );
    expect(await consentingAudience("leads", "org1")).toEqual([{ email: "warm@example.com", leadId: "l2" }]);
  });

  it("adds contacts who agreed, keeping their client link", async () => {
    state.contact.push(
      { id: "k1", organizationId: "org1", email: "a@example.com", emailConsentAt: AGREED, clientId: "c1" },
      { id: "k2", organizationId: "org1", email: "b@example.com", emailConsentAt: AGREED, clientId: null },
      { id: "k3", organizationId: "org1", email: "c@example.com", emailConsentAt: null, clientId: null },
    );
    expect(await consentingAudience("contacts", "org1")).toEqual([{ email: "a@example.com", clientId: "c1" }, { email: "b@example.com" }]);
  });

  it("always asks the database for the consent mark and the organization", async () => {
    await consentingAudience("clients", "org1");
    await consentingAudience("contacts", "org1");
    await consentingAudience("leads", "org1");
    expect(state.wheres.map((w) => w.table)).toEqual(["client", "contact", "lead"]);
    for (const w of state.wheres) {
      expect(w.where).toEqual({ organizationId: "org1", email: { not: null }, emailConsentAt: { not: null } });
    }
  });

  it("says where to set the mark when nobody agreed", () => {
    expect(nobodyAgreedMessage("clients")).toContain("client page");
    expect(nobodyAgreedMessage("contacts")).toContain("Contacts page");
    expect(nobodyAgreedMessage("leads")).toContain("lead");
  });
});

describe("the consent mark", () => {
  it("is set with a date and cleared again", async () => {
    state.client.push({ id: "c1", organizationId: "org1", email: "a@example.com", emailConsentAt: null });
    expect(await setEmailConsent({ kind: "client", id: "c1", organizationId: "org1", agreed: true, now: AGREED })).toBe(true);
    expect(state.client[0]!.emailConsentAt).toEqual(AGREED);
    expect(await setEmailConsent({ kind: "client", id: "c1", organizationId: "org1", agreed: false })).toBe(true);
    expect(state.client[0]!.emailConsentAt).toBeNull();
  });

  it("cannot be changed on another organization's record", async () => {
    state.lead.push({ id: "l1", organizationId: "other", email: "a@example.com", emailConsentAt: null });
    expect(await setEmailConsent({ kind: "lead", id: "l1", organizationId: "org1", agreed: true })).toBe(false);
    expect(state.lead[0]!.emailConsentAt).toBeNull();
  });

  it("needs the write permission of the record it belongs to", () => {
    expect(consentPermission("client")).toBe("client.write");
    expect(consentPermission("contact")).toBe("contact.write");
    expect(consentPermission("lead")).toBe("lead.write");
  });
});
