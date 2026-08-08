import { z } from "zod";
import { LeadStatus } from "@prisma/client";

/**
 * Workflow triggers. A workflow fires when the engine is invoked with a
 * matching trigger string (see engine.runTrigger).
 */
export const TRIGGERS = [
  { value: "lead_created", label: "Lead created" },
  { value: "lead_scored", label: "Lead scored" },
  { value: "contact_created", label: "Contact created" },
  { value: "campaign_created", label: "Campaign created" },
  { value: "deal_won", label: "Deal won" },
  { value: "client_at_risk", label: "Client marked at-risk" },
  { value: "report_due", label: "Report due" },
  { value: "gbp_review", label: "New GBP review" },
  { value: "webhook_received", label: "Inbound webhook" },
] as const;

export type TriggerType = (typeof TRIGGERS)[number]["value"];

export const TRIGGER_VALUES = TRIGGERS.map((t) => t.value) as [
  TriggerType,
  ...TriggerType[],
];

/**
 * Action definitions. Each action has a `type` discriminator and a `config`.
 * Kept intentionally small and side-effect-scoped so execution is auditable.
 */
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    config: z.object({
      title: z.string().min(1).max(200),
      serviceType: z.string().max(80).optional(),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
      clientId: z.string().uuid().optional(),
    }),
  }),
  z.object({
    type: z.literal("create_alert"),
    config: z.object({
      title: z.string().min(1).max(200),
      body: z.string().max(2000).optional(),
      severity: z.enum(["info", "warning", "critical"]).default("info"),
    }),
  }),
  z.object({
    type: z.literal("update_lead_status"),
    config: z.object({ status: z.nativeEnum(LeadStatus) }),
  }),
  z.object({
    type: z.literal("draft_email_campaign"),
    config: z.object({
      name: z.string().min(1).max(160),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(20000),
      source: z.enum(["leads", "clients"]).optional(),
    }),
  }),
  z.object({
    type: z.literal("log"),
    config: z.object({ message: z.string().min(1).max(500) }),
  }),
  z.object({
    type: z.literal("webhook_post"),
    config: z.object({ url: z.string().url() }),
  }),
]);

export type WorkflowAction = z.infer<typeof actionSchema>;

export const actionsSchema = z.array(actionSchema).max(20);

export const workflowCreateSchema = z.object({
  name: z.string().min(1).max(160),
  trigger: z.enum(TRIGGER_VALUES),
  actions: actionsSchema.default([]),
  enabled: z.boolean().default(true),
});

export const workflowUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  trigger: z.enum(TRIGGER_VALUES).optional(),
  actions: actionsSchema.optional(),
  enabled: z.boolean().optional(),
});

/** Context passed to the engine; actions resolve entities from it. */
export interface TriggerContext {
  organizationId: string;
  userId?: string | null;
  leadId?: string;
  clientId?: string;
  dealId?: string;
  reportId?: string;
  payload?: Record<string, unknown>;
}
