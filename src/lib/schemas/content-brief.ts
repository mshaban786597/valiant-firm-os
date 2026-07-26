import { z } from "zod";

export const contentBriefOutputSchema = z.object({
  search_intent: z.string(),
  target_keyword: z.string(),
  secondary_keywords: z.array(z.string()),
  entity_map: z.array(z.string()),
  heading_structure: z.array(z.string()),
  faq_questions: z.array(z.string()),
  internal_linking_recommendations: z.array(z.string()),
  schema_recommendation: z.string(),
  eeat_notes: z.string(),
  local_seo_notes: z.string(),
  aeo_geo_notes: z.string(),
});

export type ContentBriefOutput = z.infer<typeof contentBriefOutputSchema>;
