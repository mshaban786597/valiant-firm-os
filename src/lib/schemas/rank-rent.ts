import { z } from "zod";

export const RANK_RENT_STATUSES = [
  "Research",
  "DomainPurchased",
  "SiteBuilt",
  "ContentPublished",
  "Ranking",
  "LeadGenerating",
  "Rented",
  "Sold",
] as const;

export const RANK_RENT_STATUS_LABEL: Record<(typeof RANK_RENT_STATUSES)[number], string> = {
  Research: "Research",
  DomainPurchased: "Domain purchased",
  SiteBuilt: "Site built",
  ContentPublished: "Content published",
  Ranking: "Ranking",
  LeadGenerating: "Generating leads",
  Rented: "Rented",
  Sold: "Sold",
};

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
  .refine((v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), "Enter a domain like example.com");

export const rankRentCreateSchema = z.object({
  domain,
  niche: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  status: z.enum(RANK_RENT_STATUSES).optional(),
});

export const rankRentUpdateSchema = z.object({
  status: z.enum(RANK_RENT_STATUSES).optional(),
  /** Who rents the site; empty string clears it. */
  renterStatus: z.string().trim().max(120).optional(),
  /** Monthly rent in dollars; null clears it. */
  monthlyRevenue: z.number().min(0).max(1_000_000).nullable().optional(),
});
