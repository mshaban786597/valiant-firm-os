/**
 * Pure tool-cost math. An expense has an ACTUAL amount (what is really paid,
 * per billing cycle) and, separately, a PLANNED monthly range (a budget
 * estimate). The two are never mixed: totals are built from actual amounts
 * only, and expenses with no actual amount are counted, not guessed.
 */
export type BillingCycle = "monthly" | "yearly" | "one_time";
export type ExpenseStatus = "active" | "planned" | "canceled";

export interface ExpenseLike {
  status: string;
  billingCycle: string;
  amountCents: number | null;
  plannedLowCents: number | null;
  plannedHighCents: number | null;
}

/** Actual cost per month in cents; null when no actual amount has been entered. */
export function monthlyCostCents(e: Pick<ExpenseLike, "billingCycle" | "amountCents">): number | null {
  if (e.amountCents === null) return null;
  if (e.billingCycle === "yearly") return Math.round(e.amountCents / 12);
  if (e.billingCycle === "one_time") return 0; // not a recurring monthly cost
  return e.amountCents;
}

export interface ExpenseSummary {
  /** Recurring monthly cost of active expenses that have an actual amount. */
  actualMonthlyCents: number;
  /** Active expenses counted in the total. */
  withAmount: number;
  /** Active expenses with no actual amount yet (excluded from the total). */
  withoutAmount: number;
  /** Planned (not yet active) expenses. */
  planned: number;
  /** Sum of planned monthly ranges for everything not canceled that has a range. */
  plannedLowCents: number;
  plannedHighCents: number;
  /** One-time actual costs (shown separately, never in the monthly total). */
  oneTimeCents: number;
}

export function summarizeExpenses(expenses: ExpenseLike[]): ExpenseSummary {
  const s: ExpenseSummary = {
    actualMonthlyCents: 0,
    withAmount: 0,
    withoutAmount: 0,
    planned: 0,
    plannedLowCents: 0,
    plannedHighCents: 0,
    oneTimeCents: 0,
  };
  expenses.forEach((e) => {
    if (e.status === "canceled") return;
    if (e.plannedLowCents !== null && e.plannedHighCents !== null) {
      s.plannedLowCents += e.plannedLowCents;
      s.plannedHighCents += e.plannedHighCents;
    }
    if (e.status === "planned") {
      s.planned++;
      return;
    }
    const monthly = monthlyCostCents(e);
    if (monthly === null) {
      s.withoutAmount++;
      return;
    }
    s.withAmount++;
    if (e.billingCycle === "one_time") s.oneTimeCents += e.amountCents ?? 0;
    else s.actualMonthlyCents += monthly;
  });
  return s;
}

export interface NetSummary {
  /** Contracted MRR minus entered monthly tool costs. */
  netMonthly: number;
  /** True when some active tools have no amount, so the real net is lower. */
  incomplete: boolean;
  /** Net if every planned/unpriced tool cost its planned low / high estimate. */
  netAtPlannedLow: number;
  netAtPlannedHigh: number;
}

export function netAfterTools(contractedMrr: number, s: ExpenseSummary): NetSummary {
  const actual = s.actualMonthlyCents / 100;
  return {
    netMonthly: contractedMrr - actual,
    incomplete: s.withoutAmount > 0,
    netAtPlannedLow: contractedMrr - Math.max(actual, s.plannedLowCents / 100),
    netAtPlannedHigh: contractedMrr - Math.max(actual, s.plannedHighCents / 100),
  };
}

export const EXPENSE_CATEGORIES = [
  "Google tools",
  "SEO tools",
  "Content tools",
  "AI",
  "Hosting & infrastructure",
  "Ads",
  "Email & outreach",
  "Software",
  "Other",
] as const;
