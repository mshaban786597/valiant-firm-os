import { seedHash } from "@/lib/integrations/sample";
import { can } from "@/lib/permissions";

export interface AssignableMember {
  userId: string;
  roleKey: string | null;
}

/** Members who may own leads (have the lead.write permission). */
export function eligibleAssignees(members: AssignableMember[]): AssignableMember[] {
  return members.filter((m) => can(m.roleKey, "lead.write"));
}

/**
 * Deterministically pick an assignee from eligible members, seeded by a stable
 * key (e.g. the lead id) so scoring the same lead twice keeps the same owner
 * and load spreads evenly across reps. Returns null when nobody is eligible.
 */
export function pickAssignee(
  members: AssignableMember[],
  seed: string,
): string | null {
  const eligible = eligibleAssignees(members);
  if (eligible.length === 0) return null;
  const index = seedHash(seed) % eligible.length;
  return eligible[index].userId;
}
