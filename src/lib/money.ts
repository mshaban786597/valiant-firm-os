/**
 * Coerce a Prisma Decimal, number, or nullish value into a plain number of
 * currency units (e.g. dollars). Used across dashboards for Decimal columns.
 */
export function money(
  v: { toNumber?: () => number } | number | null | undefined,
) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

// ---------------------------------------------------------------------------
// Integer-cent money math (for billing / invoicing).
//
// All amounts are integer cents to avoid floating-point drift. Never store or
// add currency as floats — convert to cents at the boundary, do math here, and
// format only for display.
// ---------------------------------------------------------------------------

export interface LineItem {
  /** Unit price in integer cents. */
  unitCents: number;
  /** Quantity (whole units). Defaults to 1 when omitted. */
  quantity?: number;
}

/** Round to the nearest whole cent (banker-agnostic half-up on magnitude). */
export function roundCents(cents: number): number {
  return Math.round(cents);
}

/** Convert a decimal currency amount (e.g. dollars) to integer cents. */
export function toCents(amount: number): number {
  return roundCents(amount * 100);
}

/** Convert integer cents back to a decimal currency amount. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Sum line items (unitCents * quantity) into a subtotal in integer cents. */
export function sumLineItems(items: LineItem[]): number {
  return items.reduce((total, item) => {
    const qty = item.quantity ?? 1;
    return total + roundCents(item.unitCents * qty);
  }, 0);
}

/** Apply a percentage discount (0–100) to a cents amount, clamped to >= 0. */
export function applyDiscount(cents: number, discountPercent: number): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  return Math.max(0, roundCents(cents * (1 - pct / 100)));
}

/** Tax amount in integer cents for a taxable base, given a percent rate. */
export function taxAmount(cents: number, taxPercent: number): number {
  const rate = Math.max(0, taxPercent);
  return roundCents(cents * (rate / 100));
}

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Compute invoice totals from line items with an optional discount (applied to
 * subtotal before tax) and tax rate (applied to the discounted base).
 */
export function invoiceTotals(
  items: LineItem[],
  opts: { discountPercent?: number; taxPercent?: number } = {},
): InvoiceTotals {
  const subtotalCents = sumLineItems(items);
  const discountedCents = applyDiscount(
    subtotalCents,
    opts.discountPercent ?? 0,
  );
  const discountCents = subtotalCents - discountedCents;
  const taxCents = taxAmount(discountedCents, opts.taxPercent ?? 0);
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: discountedCents + taxCents,
  };
}

/** Format integer cents as a localized currency string (default USD/en-US). */
export function formatCents(
  cents: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(fromCents(cents));
}
