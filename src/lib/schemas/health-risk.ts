import { z } from "zod";

export const healthRiskOutputSchema = z.object({
  band: z.enum(["Green", "Yellow", "Orange", "Red"]),
  composite_score: z.number().min(0).max(100),
  rank_trend_pts: z.number(),
  response_pts: z.number(),
  payment_pts: z.number(),
  engagement_pts: z.number(),
  nps_pts: z.number(),
  goal_pts: z.number(),
  retention_summary: z.string(),
  check_in_email: z.string(),
});

export type HealthRiskOutput = z.infer<typeof healthRiskOutputSchema>;
