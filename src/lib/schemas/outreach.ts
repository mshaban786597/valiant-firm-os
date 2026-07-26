import { z } from "zod";

export const outreachOutputSchema = z.object({
  subject_lines: z.array(z.string()),
  email_1: z.string(),
  email_2: z.string(),
  email_3: z.string(),
  email_4: z.string(),
  linkedin_message: z.string(),
  sms_message: z.string(),
  cta: z.string(),
  personalization_notes: z.string(),
});

export type OutreachOutput = z.infer<typeof outreachOutputSchema>;
