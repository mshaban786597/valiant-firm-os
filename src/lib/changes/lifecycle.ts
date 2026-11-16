import { ApprovalStatus, type ApprovalRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

/**
 * Change proposals for incident fixes. A proposal is an ApprovalRequest of
 * kind "fix" carrying an exact scope; nothing executes without a valid,
 * unexpired approval of that exact proposal. Execution, verification and
 * closure are tracked independently so a failure at any stage stays visible.
 */
export interface ChangeScope {
  site: string;
  environment: string;
  artifactVersion: string;
  expectedBehavior: string;
  testResults: string;
  rollbackPath: string;
  filesInScope?: string[];
}

export async function proposeChange(input: {
  organizationId: string;
  incidentId: string;
  title: string;
  summary: string;
  scope: ChangeScope;
  isDemo: boolean;
  requestedBy?: string | null;
  /** Approval is only valid for this long after it is requested. */
  ttlHours?: number;
  now?: Date;
}): Promise<ApprovalRequest> {
  const now = input.now ?? new Date();
  const s = input.scope;
  const body = [
    input.summary,
    "",
    `Site: ${s.site}`,
    `Environment: ${s.environment}`,
    `Artifact version: ${s.artifactVersion}`,
    `Expected behavior: ${s.expectedBehavior}`,
    `Test results: ${s.testResults}`,
    `Rollback: ${s.rollbackPath}`,
    s.filesInScope?.length ? `Files in scope: ${s.filesInScope.join(", ")}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const approval = await prisma.approvalRequest.create({
    data: {
      organizationId: input.organizationId,
      kind: "fix",
      title: input.title,
      body,
      payload: { ...s },
      entityType: "Incident",
      entityId: input.incidentId,
      incidentId: input.incidentId,
      requestedBy: input.requestedBy ?? null,
      expiresAt: new Date(now.getTime() + (input.ttlHours ?? 72) * 3_600_000),
      isDemo: input.isDemo,
    },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.requestedBy,
    action: "change.proposed",
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { incidentId: input.incidentId, environment: s.environment, artifactVersion: s.artifactVersion },
  });
  return approval;
}

export type AuthorizationResult =
  | { ok: true }
  | { ok: false; reason: "pending" | "rejected" | "expired" | "not_a_change" };

/** Pure gate: is this exact proposal currently authorized to execute? */
export function authorizeChange(
  approval: Pick<ApprovalRequest, "kind" | "status" | "expiresAt">,
  now: Date = new Date(),
): AuthorizationResult {
  if (approval.kind !== "fix") return { ok: false, reason: "not_a_change" };
  if (approval.status === ApprovalStatus.PENDING) return { ok: false, reason: "pending" };
  if (approval.status === ApprovalStatus.REJECTED) return { ok: false, reason: "rejected" };
  if (approval.expiresAt && approval.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true };
}

const DENIAL_COPY: Record<string, string> = {
  pending: "This change has not been approved yet.",
  rejected: "This change was rejected and cannot be executed.",
  expired: "The approval for this change has expired. Request a new approval.",
  not_a_change: "This request is not a change proposal.",
};

export interface StageResult {
  ok: boolean;
  reason?: string;
  message: string;
}

/**
 * Execute an approved change through the given worker (the controlled process
 * that applies the staged patch). Denied — and audited — without a valid approval.
 */
export async function executeChange(input: {
  organizationId: string;
  approvalId: string;
  userId?: string | null;
  worker: (scope: ChangeScope) => Promise<{ ok: boolean; detail: string }>;
  now?: Date;
}): Promise<StageResult> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, organizationId: input.organizationId },
  });
  if (!approval) return { ok: false, reason: "not_found", message: "Change not found." };

  const auth = authorizeChange(approval, input.now);
  if (!auth.ok) {
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: input.userId,
      action: "change.denied",
      entity: "ApprovalRequest",
      entityId: approval.id,
      meta: { reason: auth.reason, stage: "execute" },
    });
    return { ok: false, reason: auth.reason, message: DENIAL_COPY[auth.reason]! };
  }

  let result: { ok: boolean; detail: string };
  try {
    result = await input.worker(approval.payload as unknown as ChangeScope);
  } catch (err) {
    result = { ok: false, detail: err instanceof Error ? err.message : "Worker error" };
  }
  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      executionStatus: result.ok ? "executed" : "failed",
      executedAt: new Date(),
      verificationStatus: "pending",
      verifiedAt: null,
      outcome: result.ok ? `Executed: ${result.detail}` : `Execution failed: ${result.detail}`,
    },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: result.ok ? "change.executed" : "change.execution_failed",
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { detail: result.detail },
  });
  return {
    ok: result.ok,
    message: result.ok ? `Executed: ${result.detail}` : `Execution failed: ${result.detail}`,
  };
}

/** Verify an executed change by re-running the original check. */
export async function verifyChange(input: {
  organizationId: string;
  approvalId: string;
  userId?: string | null;
  recheck: () => Promise<{ passed: boolean; detail: string }>;
}): Promise<StageResult> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, organizationId: input.organizationId },
  });
  if (!approval) return { ok: false, reason: "not_found", message: "Change not found." };
  if (approval.executionStatus !== "executed") {
    return { ok: false, reason: "not_executed", message: "Nothing to verify: the change has not been executed." };
  }
  const check = await input.recheck();
  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      verificationStatus: check.passed ? "passed" : "failed",
      verifiedAt: new Date(),
      outcome: check.passed ? `Verified: ${check.detail}` : `Verification failed: ${check.detail}`,
    },
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: check.passed ? "change.verified" : "change.verification_failed",
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { detail: check.detail },
  });
  return {
    ok: check.passed,
    message: check.passed ? `Verified: ${check.detail}` : `Verification failed: ${check.detail}`,
  };
}

/** Roll an executed change back through the worker's rollback path. */
export async function rollbackChange(input: {
  organizationId: string;
  approvalId: string;
  userId?: string | null;
  worker: (scope: ChangeScope) => Promise<{ ok: boolean; detail: string }>;
}): Promise<StageResult> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, organizationId: input.organizationId },
  });
  if (!approval) return { ok: false, reason: "not_found", message: "Change not found." };
  if (approval.executionStatus !== "executed") {
    return { ok: false, reason: "not_executed", message: "Nothing to roll back: the change is not executed." };
  }
  const result = await input.worker(approval.payload as unknown as ChangeScope);
  if (result.ok) {
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        executionStatus: "rolled_back",
        rolledBackAt: new Date(),
        verificationStatus: "pending",
        verifiedAt: null,
        outcome: `Rolled back: ${result.detail}`,
      },
    });
  }
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: result.ok ? "change.rolled_back" : "change.rollback_failed",
    entity: "ApprovalRequest",
    entityId: approval.id,
    meta: { detail: result.detail },
  });
  return { ok: result.ok, message: result.ok ? `Rolled back: ${result.detail}` : `Rollback failed: ${result.detail}` };
}
