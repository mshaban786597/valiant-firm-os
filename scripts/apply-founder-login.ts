/**
 * Make the founder's login match SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.
 *
 *   npx tsx --env-file=.env scripts/apply-founder-login.ts
 *
 * Editing .env alone does not change a login: the account lives in the
 * database. This updates the EXISTING founder account in place (no second
 * account is created, so the old email and old password stop working). The
 * password is never printed. Local and production share one database, so the
 * change applies to both at once.
 *
 * Sessions are stateless: someone already signed in stays signed in until the
 * session expires. Rotate NEXTAUTH_SECRET to sign everyone out.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { writeAuditLog } from "../src/lib/audit";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) throw new Error("SEED_ADMIN_EMAIL is missing or not an email address");
  if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const founders = await prisma.organizationMember.findMany({
    where: { organizationId: org.id, role: { label: "Founder" } },
    include: { user: { select: { id: true, email: true } } },
  });
  if (founders.length !== 1) throw new Error(`Expected exactly one founder account, found ${founders.length}; not changing anything`);
  const founder = founders[0]!.user;

  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash && clash.id !== founder.id) throw new Error(`Another account already uses ${email}; not changing anything`);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: founder.id }, data: { email, passwordHash } });

  // Read it back and prove the new password works before reporting success.
  const after = await prisma.user.findUniqueOrThrow({ where: { id: founder.id }, select: { email: true, passwordHash: true } });
  const works = !!after.passwordHash && (await bcrypt.compare(password, after.passwordHash));
  await writeAuditLog({
    organizationId: org.id,
    userId: founder.id,
    action: "auth.founder_login_changed",
    entity: "User",
    entityId: founder.id,
    meta: { emailChanged: founder.email !== email, source: "scripts/apply-founder-login" },
  });
  console.log(`Founder login updated.`);
  console.log(`  Email: ${founder.email} -> ${after.email}`);
  console.log(`  Password: changed (verified: ${works ? "the new password is accepted" : "NOT accepted — run npm run auth:reset-founder"})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 300) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
