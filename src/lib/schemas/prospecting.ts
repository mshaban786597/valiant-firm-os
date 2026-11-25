import { z } from "zod";

const text = (max: number) => z.string().trim().min(2).max(max);

export const prospectTargetSchema = z.object({
  niche: text(80),
  keyword: text(120),
  city: text(80),
  state: z.string().trim().min(2).max(40),
});

export const prospectTargetPatchSchema = z.object({ active: z.boolean() });

export const prospectRunSchema = z.object({ targetId: z.string().uuid() });

export type ProspectTargetInput = z.infer<typeof prospectTargetSchema>;
