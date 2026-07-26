import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "@prisma/client";
import { INVOICE_TRANSITIONS, canTransition } from "@/lib/status";
import { invoiceTotals } from "@/lib/money";

describe("invoice status machine", () => {
  it("moves draft → open → paid", () => {
    expect(canTransition(INVOICE_TRANSITIONS, InvoiceStatus.Draft, InvoiceStatus.Open)).toBe(true);
    expect(canTransition(INVOICE_TRANSITIONS, InvoiceStatus.Open, InvoiceStatus.Paid)).toBe(true);
  });

  it("allows voiding a draft or open invoice", () => {
    expect(canTransition(INVOICE_TRANSITIONS, InvoiceStatus.Draft, InvoiceStatus.Void)).toBe(true);
    expect(canTransition(INVOICE_TRANSITIONS, InvoiceStatus.Open, InvoiceStatus.Void)).toBe(true);
  });

  it("forbids paying a draft directly (must be sent/open first)", () => {
    expect(canTransition(INVOICE_TRANSITIONS, InvoiceStatus.Draft, InvoiceStatus.Paid)).toBe(false);
  });

  it("treats paid and void as terminal", () => {
    expect(INVOICE_TRANSITIONS[InvoiceStatus.Paid]).toHaveLength(0);
    expect(INVOICE_TRANSITIONS[InvoiceStatus.Void]).toHaveLength(0);
    expect(canTransition(INVOICE_TRANSITIONS, InvoiceStatus.Paid, InvoiceStatus.Open)).toBe(false);
  });
});

describe("invoice totals composition (used by the create API)", () => {
  it("computes a realistic invoice", () => {
    const totals = invoiceTotals(
      [
        { unitCents: 150000, quantity: 1 }, // $1,500 retainer
        { unitCents: 25000, quantity: 3 }, //  $250 x3 add-ons
      ],
      { discountPercent: 5, taxPercent: 8.25 },
    );
    // subtotal 225000; -5% => 213750 discounted; discount 11250;
    // tax 8.25% of 213750 = 17634.375 → rounds to 17634
    expect(totals.subtotalCents).toBe(225000);
    expect(totals.discountCents).toBe(11250);
    expect(totals.taxCents).toBe(17634);
    expect(totals.totalCents).toBe(213750 + 17634);
  });
});
