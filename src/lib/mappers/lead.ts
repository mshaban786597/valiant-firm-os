import type { Lead } from "@prisma/client";
import type { z } from "zod";
import { leadScoreInputSchema } from "@/lib/schemas/lead-score";

export type LeadScoreInput = z.infer<typeof leadScoreInputSchema>;

export function mapLeadToScoreInput(lead: Lead): LeadScoreInput {
  return {
    business_name: lead.businessName,
    niche: lead.niche,
    city: lead.city,
    state: lead.state,
    website_url: lead.websiteUrl,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    domain_authority: lead.domainAuthority,
    review_count: lead.reviewCount,
    star_rating: lead.starRating,
    gbp_status: lead.gbpStatus,
    website_status: lead.websiteStatus,
    weakness_tags: lead.weaknessTags,
  };
}
