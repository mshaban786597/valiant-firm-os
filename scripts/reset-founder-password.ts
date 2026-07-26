/**
 * Secure founder password rotation / one-time setup.
 *
 *   npm run auth:reset-founder            # rotate founder@valiantfirm.agency
 *   SEED_ADMIN_EMAIL=x@y npm run auth:reset-founder
 *
 * Generates a strong random password, hashes it with bcrypt (the same algorithm
 * the login uses), and updates the founder user in place. The new password is
 * printed ONCE to this local terminal only — it is never written to a file,
 * committed to git, or sent to any external service. Idempotent: it updates the
 * existing founder (matched by email) and never creates duplicates.
 *
 * NOTE: sessions are stateless JWTs, so rotating the password does NOT sign out
 * existing sessions. To invalidate all active sessions, also rotate
 * NEXTAUTH_SECRET in the deployment environment.
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function strongPassword(): string {
  // 24 url-safe chars from CSPRNG; add symbols for complexity policies.
  const base = crypto.randomBytes(18).toString("base64url");
  const sym = "!@#$%^&*".charAt(crypto.randomInt(0, 8));
  return `Vf${base}${sym}`;
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "founder@valiantfirm.agency")
    .trim()
    .toLowerCase();

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(
      `No user found for ${email}. Run "npm run db:seed" first to create the founder account.`,
    );
    process.exitCode = 1;
    return;
  }

  const password = strongPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  console.log("\n============================================================");
  console.log(" Founder password rotated successfully.");
  console.log(` Email:    ${email}`);
  console.log(` Password: ${password}`);
  console.log("------------------------------------------------------------");
  console.log(" Store this in your password manager now. It is shown ONCE,");
  console.log(" is not saved anywhere, and cannot be recovered from here.");
  console.log(" Rotate NEXTAUTH_SECRET too to invalidate old sessions.");
  console.log("============================================================\n");
}

main()
  .catch((e) => {
    console.error("Rotation failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
