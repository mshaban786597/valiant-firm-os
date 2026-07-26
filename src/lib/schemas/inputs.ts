import { z } from "zod";
import { leadScoreInputSchema } from "@/lib/schemas/lead-score";

export const outreachRequestSchema = z.object({
  lead: leadScoreInputSchema,
});

export const proposalRequestSchema = z.object({
  lead: leadScoreInputSchema,
  call_notes: z.string(),
  business_goals: z.string(),
  selected_service_package: z.string(),
  pricing_tier: z.string(),
  weaknesses: z.array(z.string()),
  market_opportunity: z.string(),
});

export const contentBriefRequestSchema = z.object({
  title: z.string(),
  target_keyword: z.string(),
  location: z.string().optional(),
  service: z.string().optional(),
  client_name: z.string().optional(),
});

export const reportSummaryRequestSchema = z.object({
  client_name: z.string(),
  month: z.string(),
  organic_sessions: z.number().optional(),
  organic_leads: z.number().optional(),
  keyword_growth: z.number().optional(),
  backlink_growth: z.number().optional(),
  gbp_calls: z.number().optional(),
  gbp_views: z.number().optional(),
  tasks_completed: z.number().optional(),
  issues_fixed: z.number().optional(),
});

export const healthRiskRequestSchema = z.object({
  client_name: z.string(),
  signals: z.object({
    rank_trend: z.number().min(0).max(25),
    response_time: z.number().min(0).max(15),
    payment_history: z.number().min(0).max(20),
    report_engagement: z.number().min(0).max(10),
    nps: z.number().min(0).max(15),
    goal_progress: z.number().min(0).max(15),
  }),
});
