import { z } from "zod";

export const adsCreateSchema = z.object({
  campaignId: z.string().min(1).max(120),
  campaignName: z.string().min(1).max(200),
  status: z.string().max(40).default("ENABLED"),
  clientId: z.string().uuid().nullable().optional(),
});

export const adsUpdateSchema = z.object({
  action: z.literal("refresh").optional(),
  status: z.string().max(40).optional(),
  clientId: z.string().uuid().nullable().optional(),
});
