import { describe, expect, it } from "vitest";
import { escapeCsvValue, toCsv } from "@/lib/export";
import { parseCsv } from "@/lib/import";
import { ONBOARDING_DEFAULT_ITEMS } from "@/lib/onboarding";

describe("CSV export", () => {
  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvValue("plain")).toBe("plain");
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvValue(null)).toBe("");
  });

  it("serializes rows with a header", () => {
    const csv = toCsv(
      [{ name: "Acme, Inc", score: 82 }],
      [
        { header: "name", value: (r) => r.name },
        { header: "score", value: (r) => r.score },
      ],
    );
    expect(csv).toBe('name,score\r\n"Acme, Inc",82');
  });
});

describe("CSV import (round-trip)", () => {
  it("parses a header + rows into objects", () => {
    const rows = parseCsv("businessName,city\nAcme,Austin\nNova,Dallas");
    expect(rows).toEqual([
      { businessName: "Acme", city: "Austin" },
      { businessName: "Nova", city: "Dallas" },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsv('name,note\n"Acme, Inc","said ""hi"""');
    expect(rows[0]).toEqual({ name: "Acme, Inc", note: 'said "hi"' });
  });

  it("ignores blank lines", () => {
    const rows = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(rows).toHaveLength(2);
  });

  it("round-trips export → import", () => {
    const csv = toCsv(
      [{ businessName: "Acme, Inc", city: "Austin" }],
      [
        { header: "businessName", value: (r) => r.businessName },
        { header: "city", value: (r) => r.city },
      ],
    );
    expect(parseCsv(csv)).toEqual([{ businessName: "Acme, Inc", city: "Austin" }]);
  });
});

describe("onboarding checklist", () => {
  it("has 25+ items with unique keys and monotonic sort order", () => {
    expect(ONBOARDING_DEFAULT_ITEMS.length).toBeGreaterThanOrEqual(25);
    const keys = new Set(ONBOARDING_DEFAULT_ITEMS.map((i) => i.key));
    expect(keys.size).toBe(ONBOARDING_DEFAULT_ITEMS.length);
    const orders = ONBOARDING_DEFAULT_ITEMS.map((i) => i.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("includes keys used for auto-progress", () => {
    const keys = ONBOARDING_DEFAULT_ITEMS.map((i) => i.key);
    expect(keys).toContain("gbp_access_received");
    expect(keys).toContain("gsc_access_received");
  });
});
