import { z } from "zod";

export const gscCreateSchema = z.object({
  siteUrl: z.string().min(3).max(300),
  clientId: z.string().uuid().nullable().optional(),
  verified: z.boolean().optional(),
});

export const gscUpdateSchema = z.object({
  action: z.literal("refresh").optional(),
  verified: z.boolean().optional(),
  clientId: z.string().uuid().nullable().optional(),
});
