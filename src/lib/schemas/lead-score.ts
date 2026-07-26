import { z } from "zod";

export const leadScoreInputSchema = z.object({
  business_name: z.string(),
  niche: z.string(),
  city: z.string(),
  state: z.string(),
  website_url: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  domain_authority: z.number().nullable().optional(),
  review_count: z.number().nullable().optional(),
  star_rating: z.number().nullable().optional(),
  gbp_status: z.string().nullable().optional(),
  website_status: z.string().nullable().optional(),
  weakness_tags: z.array(z.string()).optional(),
});

export const leadScoreOutputSchema = z.object({
  composite_score: z.number().min(0).max(100),
  seo_weakness_score: z.number().min(0).max(25),
  gbp_score: z.number().min(0).max(20),
  review_velocity_score: z.number().min(0).max(20),
  website_quality_score: z.number().min(0).max(20),
  business_signal_score: z.number().min(0).max(15),
  weakness_tags: z.array(z.string()),
  recommended_offer: z.string(),
  first_email_hook: z.string(),
  outreach_angle: z.string(),
  priority_status: z.enum([
    "Priority Target",
    "Outreach Queue",
    "Warm Manual Review",
    "Archive / Recheck Later",
  ]),
  reasoning_summary: z.string(),
});

export type LeadScoreOutput = z.infer<typeof leadScoreOutputSchema>;
