import { z } from "zod";

export const reportSummaryOutputSchema = z.object({
  executive_summary: z.string(),
  wins_this_month: z.array(z.string()),
  issues_fixed: z.array(z.string()),
  ranking_movements: z.string(),
  traffic_summary: z.string(),
  gbp_summary: z.string(),
  next_30_days: z.array(z.string()),
  client_friendly_explanation: z.string(),
});

export type ReportSummaryOutput = z.infer<typeof reportSummaryOutputSchema>;
