import { z } from "zod";

export const approvalCreateSchema = z.object({
  kind: z.enum(["outreach_email", "fix", "content", "ads_change", "custom"]).default("custom"),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(80).optional(),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional(),
});
