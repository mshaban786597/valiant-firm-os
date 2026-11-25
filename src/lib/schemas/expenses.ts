import { z } from "zod";

const cents = z.number().int().min(0).max(100_000_000);

export const expenseCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    vendor: z.string().max(120).nullable().optional(),
    category: z.string().min(1).max(60),
    billingCycle: z.enum(["monthly", "yearly", "one_time"]).default("monthly"),
    /** Actual amount per billing cycle, in cents. Null = not entered yet. */
    amountCents: cents.nullable().optional(),
    plannedLowCents: cents.nullable().optional(),
    plannedHighCents: cents.nullable().optional(),
    status: z.enum(["active", "planned", "canceled"]).default("active"),
    renewsOn: z.string().datetime().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (d) =>
      d.plannedLowCents == null ||
      d.plannedHighCents == null ||
      d.plannedLowCents <= d.plannedHighCents,
    { message: "Planned low must not exceed planned high" },
  );

export const expenseUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  vendor: z.string().max(120).nullable().optional(),
  category: z.string().min(1).max(60).optional(),
  billingCycle: z.enum(["monthly", "yearly", "one_time"]).optional(),
  amountCents: cents.nullable().optional(),
  plannedLowCents: cents.nullable().optional(),
  plannedHighCents: cents.nullable().optional(),
  status: z.enum(["active", "planned", "canceled"]).optional(),
  renewsOn: z.string().datetime().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
