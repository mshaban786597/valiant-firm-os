import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  formatCents,
  fromCents,
  invoiceTotals,
  money,
  sumLineItems,
  taxAmount,
  toCents,
} from "@/lib/money";

describe("money() coercion", () => {
  it("returns 0 for null/undefined", () => {
    expect(money(null)).toBe(0);
    expect(money(undefined)).toBe(0);
  });

  it("passes numbers through", () => {
    expect(money(42.5)).toBe(42.5);
  });

  it("unwraps Prisma Decimal-like objects via toNumber()", () => {
    expect(money({ toNumber: () => 19.99 })).toBe(19.99);
  });
});

describe("integer-cent conversions", () => {
  it("round-trips dollars <-> cents without drift", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1999)).toBe(19.99);
    expect(toCents(0.1 + 0.2)).toBe(30); // classic float trap → 30 cents
  });
});

describe("sumLineItems", () => {
  it("multiplies unit price by quantity and sums", () => {
    expect(
      sumLineItems([
        { unitCents: 1000, quantity: 2 },
        { unitCents: 250, quantity: 3 },
      ]),
    ).toBe(2750);
  });

  it("defaults quantity to 1", () => {
    expect(sumLineItems([{ unitCents: 500 }])).toBe(500);
  });

  it("returns 0 for empty invoices", () => {
    expect(sumLineItems([])).toBe(0);
  });
});

describe("applyDiscount", () => {
  it("applies a percentage discount", () => {
    expect(applyDiscount(10000, 10)).toBe(9000);
  });

  it("clamps out-of-range percentages and never goes negative", () => {
    expect(applyDiscount(10000, 150)).toBe(0);
    expect(applyDiscount(10000, -20)).toBe(10000);
  });
});

describe("taxAmount", () => {
  it("computes tax on a base", () => {
    expect(taxAmount(10000, 8.25)).toBe(825);
  });

  it("treats negative rates as zero", () => {
    expect(taxAmount(10000, -5)).toBe(0);
  });
});

describe("invoiceTotals", () => {
  it("applies discount before tax and totals correctly", () => {
    const totals = invoiceTotals(
      [
        { unitCents: 10000, quantity: 1 },
        { unitCents: 5000, quantity: 1 },
      ],
      { discountPercent: 10, taxPercent: 10 },
    );
    // subtotal 15000, -10% => 13500 discounted, discount 1500, tax 1350
    expect(totals).toEqual({
      subtotalCents: 15000,
      discountCents: 1500,
      taxCents: 1350,
      totalCents: 14850,
    });
  });

  it("defaults discount and tax to zero", () => {
    const totals = invoiceTotals([{ unitCents: 2000, quantity: 2 }]);
    expect(totals.totalCents).toBe(4000);
    expect(totals.discountCents).toBe(0);
    expect(totals.taxCents).toBe(0);
  });
});

describe("formatCents", () => {
  it("formats USD by default", () => {
    expect(formatCents(199900)).toBe("$1,999.00");
  });

  it("respects an explicit currency", () => {
    // Non-breaking space separates symbol in some locales; assert digits present.
    expect(formatCents(5000, "EUR")).toContain("50.00");
  });
});
