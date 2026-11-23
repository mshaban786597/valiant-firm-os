import { describe, expect, it } from "vitest";
import { monthlyCostCents, netAfterTools, summarizeExpenses, type ExpenseLike } from "@/lib/expenses";
import { expenseCreateSchema } from "@/lib/schemas/expenses";
import { can } from "@/lib/permissions";
import { NAV_ITEMS } from "@/components/layout/nav-items";

const e = (over: Partial<ExpenseLike>): ExpenseLike => ({
  status: "active",
  billingCycle: "monthly",
  amountCents: null,
  plannedLowCents: null,
  plannedHighCents: null,
  ...over,
});

describe("tool cost math", () => {
  it("converts billing cycles to a monthly cost", () => {
    expect(monthlyCostCents({ billingCycle: "monthly", amountCents: 9900 })).toBe(9900);
    expect(monthlyCostCents({ billingCycle: "yearly", amountCents: 120000 })).toBe(10000);
    expect(monthlyCostCents({ billingCycle: "one_time", amountCents: 50000 })).toBe(0);
    expect(monthlyCostCents({ billingCycle: "monthly", amountCents: null })).toBeNull();
  });

  it("totals only actual amounts and counts unpriced tools instead of guessing", () => {
    const s = summarizeExpenses([
      e({ amountCents: 9900 }),
      e({ billingCycle: "yearly", amountCents: 120000 }),
      e({ amountCents: null, plannedLowCents: 5000, plannedHighCents: 20000 }), // active, not priced
      e({ status: "planned", plannedLowCents: 10000, plannedHighCents: 30000 }),
      e({ status: "canceled", amountCents: 99900, plannedLowCents: 1, plannedHighCents: 2 }),
      e({ billingCycle: "one_time", amountCents: 50000 }),
    ]);
    expect(s).toEqual({
      actualMonthlyCents: 19900,
      withAmount: 3,
      withoutAmount: 1,
      planned: 1,
      plannedLowCents: 15000,
      plannedHighCents: 50000,
      oneTimeCents: 50000,
    });
  });

  it("is all zeros with no expenses", () => {
    expect(summarizeExpenses([])).toEqual({
      actualMonthlyCents: 0, withAmount: 0, withoutAmount: 0, planned: 0,
      plannedLowCents: 0, plannedHighCents: 0, oneTimeCents: 0,
    });
  });

  it("computes net after tools and flags when it is incomplete", () => {
    // 3 clients at $1,700 = $5,100 contracted.
    const priced = summarizeExpenses([e({ amountCents: 29900 }), e({ amountCents: 10000 })]);
    expect(netAfterTools(5100, priced)).toMatchObject({ netMonthly: 4701, incomplete: false });

    const plannedOnly = summarizeExpenses([
      e({ amountCents: null, plannedLowCents: 5000, plannedHighCents: 20000 }),
      e({ status: "planned", plannedLowCents: 35000, plannedHighCents: 120000 }),
    ]);
    const net = netAfterTools(5100, plannedOnly);
    expect(net.netMonthly).toBe(5100); // nothing entered yet, so nothing is subtracted
    expect(net.incomplete).toBe(true);
    expect(net.netAtPlannedLow).toBe(4700);
    expect(net.netAtPlannedHigh).toBe(3700);
  });
});

describe("expense input + access", () => {
  it("accepts an unpriced planned tool and rejects an inverted range", () => {
    const ok = expenseCreateSchema.safeParse({
      name: "Ubersuggest", category: "SEO tools", status: "planned", plannedLowCents: 10000, plannedHighCents: 30000,
    });
    expect(ok.success).toBe(true);
    expect(
      expenseCreateSchema.safeParse({ name: "X", category: "Other", plannedLowCents: 300, plannedHighCents: 100 }).success,
    ).toBe(false);
    expect(expenseCreateSchema.safeParse({ name: "X", category: "Other", amountCents: -5 }).success).toBe(false);
  });
  it("keeps tool costs to finance roles", () => {
    expect(can("FOUNDER", "expense.write")).toBe(true);
    expect(can("FINANCE", "expense.write")).toBe(true);
    expect(can("MANAGER", "expense.read")).toBe(true);
    expect(can("SALES", "expense.read")).toBe(false);
    expect(can("VIEWER", "expense.read")).toBe(false);
    expect(can("OPS", "expense.write")).toBe(false);
  });
  it("is reachable from the navigation", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toContain("/expenses");
  });
});
