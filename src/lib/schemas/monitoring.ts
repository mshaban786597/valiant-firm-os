import { z } from "zod";
import { MonitorType } from "@prisma/client";

export const monitorCreateSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.nativeEnum(MonitorType).default(MonitorType.UPTIME),
  target: z.string().min(1).max(500),
  clientId: z.string().uuid().nullable().optional(),
  cadenceMinutes: z.number().int().min(5).max(1440).default(15),
  enabled: z.boolean().default(true),
});

export const monitorUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  target: z.string().min(1).max(500).optional(),
  cadenceMinutes: z.number().int().min(5).max(1440).optional(),
  enabled: z.boolean().optional(),
  clientId: z.string().uuid().nullable().optional(),
});

// For a run: optionally force a simulated result (Client-Ops pilot).
export const monitorRunSchema = z.object({
  simulate: z.enum(["ok", "fail"]).optional(),
  detail: z.string().max(500).optional(),
});

export const incidentUpdateSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  note: z.string().max(1000).optional(),
});
