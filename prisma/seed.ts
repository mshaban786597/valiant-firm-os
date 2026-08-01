/**
 * Production-safe seed. Creates ONLY essential system configuration:
 *   - the Valiant Firm organization
 *   - roles (permissions live in src/lib/permissions.ts, keyed by role.key)
 *   - the founder user + membership
 *   - baseline branding settings
 *
 * It creates NO clients, leads, deals, reports, invoices, automations, AI logs
 * or any operational/financial data. It is idempotent (all upserts), so it is
 * safe to run repeatedly and safe to run in production.
 *
 * For a full sample environment during local development, use the separate
 * dev-only demo seed:  npm run db:seed:demo
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Production role set. Keys must match src/lib/permissions.ts ROLE_KEYS.
const ROLES: { key: string; label: string }[] = [
  { key: "FOUNDER", label: "Founder" },
  { key: "OPS", label: "Operations" },
  { key: "SALES", label: "Sales" },
  { key: "MANAGER", label: "Account Manager" },
  { key: "FINANCE", label: "Finance" },
  { key: "DELIVERY", label: "Delivery" },
  { key: "VIEWER", label: "Viewer" },
];

const SETTINGS: { key: string; value: unknown }[] = [
  { key: "brand.accent", value: "#D30404" },
  { key: "brand.name", value: "Valiant Firm" },
];

async function main() {
  // Roles
  const roles: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: { label: r.label },
      create: { key: r.key, label: r.label },
    });
    roles[r.key] = role.id;
  }

  // Organization
  const org = await prisma.organization.upsert({
    where: { slug: "valiant-firm" },
    update: { name: "Valiant Firm" },
    create: { name: "Valiant Firm", slug: "valiant-firm" },
  });

  // Founder user. Password comes from SEED_ADMIN_PASSWORD; if unset we generate
  // a random one (no hardcoded shared default) and print it ONCE below.
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "founder@valiantfirm.agency";
  const providedPassword = process.env.SEED_ADMIN_PASSWORD;
  const generated = !providedPassword;
  const passwordPlain =
    providedPassword ?? `Vf${crypto.randomBytes(15).toString("base64url")}!`;

  // Only (re)set the password when explicitly provided, or when the user is new
  // (avoids silently clobbering an existing founder password on every re-seed).
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  const passwordHash = await bcrypt.hash(passwordPlain, 12);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: providedPassword ? { passwordHash, name: "Founder" } : { name: "Founder" },
    create: { email: adminEmail, name: "Founder", passwordHash },
  });

  if (generated && !existing) {
    console.log("\n============================================================");
    console.log(" Founder account created with a generated password:");
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${passwordPlain}`);
    console.log(" Store it now (shown once). Set SEED_ADMIN_PASSWORD to control it.");
    console.log("============================================================\n");
  }

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { roleId: roles.FOUNDER },
    create: { organizationId: org.id, userId: user.id, roleId: roles.FOUNDER },
  });

  // Baseline branding settings
  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: org.id, key: s.key } },
      update: { value: s.value as never },
      create: { organizationId: org.id, key: s.key, value: s.value as never },
    });
  }

  console.log("System seed complete (production-safe):", {
    org: org.slug,
    roles: ROLES.map((r) => r.key),
    admin: adminEmail,
    operationalData: "none (use db:seed:demo for sample data)",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
