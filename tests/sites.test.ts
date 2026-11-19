import { describe, expect, it } from "vitest";
import { isSiteKind, ownershipLabel, SITE_KIND_LABEL } from "@/lib/sites/registry";

describe("website register", () => {
  it("accepts only the three kinds of ownership", () => {
    expect(isSiteKind("client")).toBe(true);
    expect(isSiteKind("rank_rent")).toBe(true);
    expect(isSiteKind("own")).toBe(true);
    expect(isSiteKind("partner")).toBe(false);
    expect(isSiteKind(undefined)).toBe(false);
  });

  it("says whose a website is, and admits when it is not known", () => {
    expect(ownershipLabel({ kind: "client", clientName: "Big Bend Gutters" })).toBe("Client: Big Bend Gutters");
    expect(ownershipLabel({ kind: "client", clientName: null })).toBe("Client (not linked)");
    expect(ownershipLabel({ kind: "rank_rent" })).toBe(SITE_KIND_LABEL.rank_rent);
    expect(ownershipLabel({ kind: "own" })).toBe("Our own website");
    expect(ownershipLabel(null)).toBe("Not classified");
    expect(ownershipLabel({ kind: "something else" })).toBe("Not classified");
  });
});
