import { z } from "zod";
import { EcommercePlatform } from "@prisma/client";

export const storeCreateSchema = z.object({
  platform: z.nativeEnum(EcommercePlatform),
  name: z.string().min(1).max(200),
  storeUrl: z.string().max(300).nullable().optional(),
  externalId: z.string().max(200).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  currency: z.string().length(3).default("USD"),
});

export const storeUpdateSchema = z.object({
  action: z.literal("refresh").optional(),
  name: z.string().min(1).max(200).optional(),
  storeUrl: z.string().max(300).nullable().optional(),
  status: z.enum(["connected", "disconnected", "setup_required"]).optional(),
  clientId: z.string().uuid().nullable().optional(),
});

export const productCreateSchema = z.object({
  title: z.string().min(1).max(300),
  sku: z.string().max(120).nullable().optional(),
  priceDollars: z.number().min(0).max(10_000_000),
  inventory: z.number().int().min(0).max(10_000_000).default(0),
  status: z.enum(["active", "out_of_stock", "archived"]).default("active"),
  url: z.string().max(500).nullable().optional(),
});
