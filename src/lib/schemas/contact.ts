import { z } from "zod";

export const contactCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  role: z.string().max(80).nullable().optional(),
  source: z.string().max(80).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  clientId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial().extend({
  lastContactedAt: z.string().datetime().nullable().optional(),
});
