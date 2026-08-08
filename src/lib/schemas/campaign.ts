import { z } from "zod";
import { CampaignChannel } from "@prisma/client";

export const campaignCreateSchema = z.object({
  clientId: z.string().uuid(),
  channel: z.nativeEnum(CampaignChannel),
  name: z.string().min(1).max(200),
  status: z.enum(["active", "paused", "completed", "draft"]).default("active"),
  budgetDollars: z.number().min(0).max(100_000_000).optional(),
  goals: z.string().max(4000).nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const campaignUpdateSchema = z.object({
  channel: z.nativeEnum(CampaignChannel).optional(),
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "paused", "completed", "draft"]).optional(),
  budgetDollars: z.number().min(0).max(100_000_000).optional(),
  goals: z.string().max(4000).nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});
