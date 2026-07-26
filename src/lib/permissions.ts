/**
 * Pure, dependency-free role-based access control.
 *
 * This is the single source of truth for "can role X do action Y". API routes
 * and UI both consult `can()` so server enforcement and button-hiding never
 * drift apart. It intentionally has no imports (no Prisma, no session) so it is
 * trivially unit-testable and safe to import anywhere.
 *
 * Safe by default: an unknown or missing role is denied every action.
 */

// Roles currently seeded (FOUNDER/OPS/SALES) plus the wider set the RBAC
// roadmap targets. Anything not listed here is treated as an unknown role.
export const ROLE_KEYS = [
  "FOUNDER",
  "ADMIN",
  "MANAGER",
  "OPS",
  "SALES",
  "FINANCE",
  "DELIVERY",
  "SEO_SPECIALIST",
  "ADS_SPECIALIST",
  "STAFF",
  "VIEWER",
] as const;

export type Role = (typeof ROLE_KEYS)[number];

export const ACTIONS = [
  // leads / pipeline
  "lead.read",
  "lead.write",
  "lead.delete",
  "deal.read",
  "deal.write",
  // clients / delivery
  "client.read",
  "client.write",
  "client.delete",
  "task.read",
  "task.write",
  // reporting
  "report.read",
  "report.write",
  "report.send",
  // billing
  "invoice.read",
  "invoice.write",
  // marketing integrations (GBP / GSC / Ads)
  "integration.read",
  "integration.write",
  // email campaigns
  "email.read",
  "email.write",
  // automation / workflows
  "automation.read",
  "automation.write",
  // org administration
  "org.settings",
  "org.members",
  "audit.read",
] as const;

export type Action = (typeof ACTIONS)[number];

const ALL = "*" as const;

/** Read-only surface shared by low-privilege roles. */
const READ_ONLY: Action[] = [
  "lead.read",
  "deal.read",
  "client.read",
  "task.read",
  "report.read",
  "invoice.read",
  "integration.read",
  "email.read",
  "automation.read",
];

const ROLE_PERMISSIONS: Record<Role, typeof ALL | Action[]> = {
  // Full control.
  FOUNDER: ALL,
  ADMIN: ALL,
  // Runs delivery + reporting + billing + marketing, but not org ownership.
  MANAGER: [
    ...READ_ONLY,
    "lead.write",
    "deal.write",
    "client.write",
    "task.write",
    "report.write",
    "report.send",
    "invoice.write",
    "integration.write",
    "email.write",
    "automation.write",
    "audit.read",
  ],
  // Operations: delivery + reporting + marketing ops, no billing/members.
  OPS: [
    ...READ_ONLY,
    "client.write",
    "task.write",
    "report.write",
    "report.send",
    "integration.write",
    "email.write",
    "automation.write",
  ],
  // Sales: leads + pipeline, read the rest.
  SALES: [...READ_ONLY, "lead.write", "deal.write"],
  // Finance: billing + invoices, read the rest.
  FINANCE: [...READ_ONLY, "invoice.write"],
  // Delivery: task execution + reporting, read the rest.
  DELIVERY: [...READ_ONLY, "task.write", "report.write"],
  // SEO specialist: manages GBP/GSC integrations, tasks, reports.
  SEO_SPECIALIST: [...READ_ONLY, "task.write", "report.write", "integration.write"],
  // Ads specialist: manages Ads integrations, tasks, reports.
  ADS_SPECIALIST: [...READ_ONLY, "task.write", "report.write", "integration.write"],
  // Staff: task execution only.
  STAFF: [...READ_ONLY, "task.write"],
  // Viewer: strictly read-only.
  VIEWER: [...READ_ONLY],
};

function isRole(role: string | null | undefined): role is Role {
  return !!role && (ROLE_KEYS as readonly string[]).includes(role);
}

/** True if the given role key is permitted to perform the action. */
export function can(role: string | null | undefined, action: Action): boolean {
  if (!isRole(role)) return false;
  const grants = ROLE_PERMISSIONS[role];
  return grants === ALL || grants.includes(action);
}

/** Every action a role is granted (expanded from wildcard when needed). */
export function permittedActions(role: string | null | undefined): Action[] {
  if (!isRole(role)) return [];
  const grants = ROLE_PERMISSIONS[role];
  return grants === ALL ? [...ACTIONS] : [...grants];
}

/** Roles with unrestricted access. */
export function isPrivileged(role: string | null | undefined): boolean {
  return isRole(role) && ROLE_PERMISSIONS[role] === ALL;
}
