import { z } from "zod";

export const portalTokenCreateSchema = z.object({
  label: z.string().max(80).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});
