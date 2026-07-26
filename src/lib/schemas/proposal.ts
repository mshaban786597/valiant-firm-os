import { z } from "zod";

export const proposalOutputSchema = z.object({
  executive_summary: z.string(),
  current_problem: z.string(),
  opportunity: z.string(),
  recommended_solution: z.string(),
  scope_of_work: z.array(z.string()),
  plan_30_day: z.array(z.string()),
  plan_60_day: z.array(z.string()),
  plan_90_day: z.array(z.string()),
  pricing: z.string(),
  expected_outcomes: z.array(z.string()),
  next_steps: z.array(z.string()),
});

export type ProposalOutput = z.infer<typeof proposalOutputSchema>;
