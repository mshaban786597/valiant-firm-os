import { z } from "zod";

export const gbpCreateSchema = z.object({
  gbpId: z.string().min(1).max(120),
  businessName: z.string().min(1).max(200),
  category: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
});

export const gbpUpdateSchema = z.object({
  action: z.literal("refresh").optional(),
  category: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
});

export type GbpCreateInput = z.infer<typeof gbpCreateSchema>;
