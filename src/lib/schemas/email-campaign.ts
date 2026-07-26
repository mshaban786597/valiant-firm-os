import { z } from "zod";

export const emailCampaignCreateSchema = z.object({
  name: z.string().min(1).max(160),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

export const emailCampaignUpdateSchema = z.object({
  action: z.literal("send").optional(),
  name: z.string().min(1).max(160).optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(20000).optional(),
});

export const emailRecipientsSchema = z.object({
  source: z.enum(["clients", "leads"]).optional(),
  emails: z.array(z.string().email()).max(1000).optional(),
});
