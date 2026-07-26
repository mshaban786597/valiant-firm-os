import type { Workflow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { telemetry } from "@/lib/telemetry";
import { LEAD_TRANSITIONS, canTransition } from "@/lib/status";
import {
  actionsSchema,
  type TriggerContext,
  type TriggerType,
  type WorkflowAction,
} from "@/lib/automations/types";

const MAX_ATTEMPTS = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Execute a single action against the trigger context. Throws on failure. */
async function executeAction(
  action: WorkflowAction,
  ctx: TriggerContext,
): Promise<string> {
  switch (action.type) {
    case "create_task": {
      const clientId = action.config.clientId ?? ctx.clientId;
      if (!clientId) throw new Error("create_task requires a client in context or config");
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!client) throw new Error("create_task: client not in organization");
      const task = await prisma.task.create({
        data: {
          organizationId: ctx.organizationId,
          clientId,
          title: action.config.title,
          serviceType: action.config.serviceType ?? "Automation",
          priority: action.config.priority ?? "Medium",
        },
      });
      return `task:${task.id}`;
    }

    case "create_alert": {
      const alert = await prisma.founderAlert.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: ctx.clientId ?? null,
          title: action.config.title,
          body: action.config.body ?? action.config.title,
          severity: action.config.severity,
        },
      });
      return `alert:${alert.id}`;
    }

    case "update_lead_status": {
      if (!ctx.leadId) throw new Error("update_lead_status requires a lead in context");
      const lead = await prisma.lead.findFirst({
        where: { id: ctx.leadId, organizationId: ctx.organizationId },
        select: { id: true, status: true },
      });
      if (!lead) throw new Error("update_lead_status: lead not found");
      if (!canTransition(LEAD_TRANSITIONS, lead.status, action.config.status)) {
        throw new Error(
          `update_lead_status: illegal ${lead.status} → ${action.config.status}`,
        );
      }
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: action.config.status },
      });
      return `lead_status:${action.config.status}`;
    }

    case "draft_email_campaign": {
      const campaign = await prisma.emailCampaign.create({
        data: {
          organizationId: ctx.organizationId,
          name: action.config.name,
          subject: action.config.subject,
          body: action.config.body,
          status: "draft",
        },
      });
      if (action.config.source) {
        const rows =
          action.config.source === "clients"
            ? await prisma.client.findMany({
                where: { organizationId: ctx.organizationId, email: { not: null } },
                select: { id: true, email: true },
              })
            : await prisma.lead.findMany({
                where: { organizationId: ctx.organizationId, email: { not: null } },
                select: { id: true, email: true },
              });
        const seen = new Set<string>();
        const recipients = rows
          .filter((r) => r.email && !seen.has(r.email.toLowerCase()) && seen.add(r.email.toLowerCase()))
          .map((r) => ({
            campaignId: campaign.id,
            email: r.email as string,
            clientId: action.config.source === "clients" ? r.id : null,
            leadId: action.config.source === "leads" ? r.id : null,
            status: "pending",
          }));
        if (recipients.length) {
          await prisma.emailRecipient.createMany({ data: recipients });
          await prisma.emailCampaign.update({
            where: { id: campaign.id },
            data: { recipientCount: recipients.length },
          });
        }
      }
      return `campaign:${campaign.id}`;
    }

    case "log": {
      await telemetry.info({
        source: "automation.action.log",
        message: action.config.message,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      return "logged";
    }

    case "webhook_post": {
      // Outbound webhooks are an external call → gated. Off by default so
      // automations are safe to run without dispatching real requests.
      if (process.env.ALLOW_OUTBOUND_WEBHOOKS !== "true") {
        return "webhook_post:skipped(outbound disabled)";
      }
      const res = await fetch(action.config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: ctx.payload ?? {}, context: { organizationId: ctx.organizationId } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`webhook_post: ${res.status}`);
      return `webhook_post:${res.status}`;
    }
  }
}

export interface WorkflowRunResult {
  workflowId: string;
  name: string;
  ok: boolean;
  results: string[];
  error?: string;
}

/** Run one workflow's actions in order, each with retry. */
export async function runWorkflow(
  workflow: Pick<Workflow, "id" | "name" | "actions" | "organizationId">,
  ctx: TriggerContext,
): Promise<WorkflowRunResult> {
  const parsed = actionsSchema.safeParse(workflow.actions);
  const actions = parsed.success ? parsed.data : [];
  const results: string[] = [];

  try {
    for (const action of actions) {
      const result = await withRetry(() => executeAction(action, ctx));
      results.push(`${action.type}=${result}`);
    }
    await prisma.$transaction([
      prisma.workflow.update({
        where: { id: workflow.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      }),
      prisma.automationLog.create({
        data: {
          organizationId: ctx.organizationId,
          name: workflow.name,
          trigger: `workflow:${workflow.id}`,
          status: "success",
          lastRun: new Date(),
          successCount: results.length,
        },
      }),
    ]);
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "workflow.run",
      entity: "Workflow",
      entityId: workflow.id,
      meta: { results },
    });
    return { workflowId: workflow.id, name: workflow.name, ok: true, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.automationLog.create({
      data: {
        organizationId: ctx.organizationId,
        name: workflow.name,
        trigger: `workflow:${workflow.id}`,
        status: "failed",
        lastRun: new Date(),
        successCount: results.length,
        failureCount: 1,
        errorMessage: message,
      },
    });
    await telemetry.error({
      source: "automation.workflow.run",
      message: `Workflow "${workflow.name}" failed: ${message}`,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      meta: { workflowId: workflow.id, completed: results },
    });
    return { workflowId: workflow.id, name: workflow.name, ok: false, results, error: message };
  }
}

/**
 * Fire all enabled workflows matching a trigger for the organization.
 * Best-effort: one failing workflow never blocks the others.
 */
export async function runTrigger(
  trigger: TriggerType,
  ctx: TriggerContext,
): Promise<WorkflowRunResult[]> {
  const workflows = await prisma.workflow.findMany({
    where: { organizationId: ctx.organizationId, trigger, enabled: true },
    select: { id: true, name: true, actions: true, organizationId: true },
  });
  const out: WorkflowRunResult[] = [];
  for (const wf of workflows) {
    out.push(await runWorkflow(wf, ctx));
  }
  return out;
}
