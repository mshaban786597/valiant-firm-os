import { z } from "zod";

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(100000).default(1),
  unitCents: z.number().int().min(0).max(1_000_000_00),
});

export const invoiceCreateSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  number: z.string().max(60).nullable().optional(),
  currency: z.string().length(3).default("USD"),
  discountRate: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  paymentMethod: z.string().max(60).nullable().optional(),
  lineItems: z.array(invoiceLineItemSchema).min(1).max(100),
});

export const invoiceUpdateSchema = z.object({
  status: z.enum(["Draft", "Open", "Paid", "Void"]).optional(),
  paymentMethod: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
