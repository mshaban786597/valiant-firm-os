import type { NextAuthOptions } from "next-auth";
import { authSecret } from "@/lib/auth-secret";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginAllowed, recordLoginAttempt } from "@/lib/rate-limit";

function clientIp(req?: { headers?: Record<string, string> }): string {
  const fwd = req?.headers?.["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0]!.trim();
  return req?.headers?.["x-real-ip"] ?? "unknown";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  // Route auth errors (incl. Configuration) back to /login so users never see
  // the raw /api/auth/error page; the form maps the ?error= code to safe copy.
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;
        const ip = clientIp(req as { headers?: Record<string, string> });

        try {
          // Brute-force throttle: lock out after too many recent failures.
          if (!(await loginAllowed(email, ip))) {
            throw new Error("RateLimited");
          }

          const user = await prisma.user.findUnique({ where: { email } });
          // Same response for "no user" and "bad password" — don't reveal which.
          if (!user?.passwordHash) {
            await recordLoginAttempt(email, ip, false);
            return null;
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) {
            await recordLoginAttempt(email, ip, false);
            return null;
          }

          // Must belong to an organization to use the app.
          const membership = await prisma.organizationMember.findFirst({
            where: { userId: user.id },
            select: { id: true },
          });
          if (!membership) {
            await recordLoginAttempt(email, ip, false);
            return null;
          }

          await recordLoginAttempt(email, ip, true);
          return {
            id: user.id,
            email: user.email ?? undefined,
            name: user.name ?? undefined,
            image: user.image ?? undefined,
          };
        } catch (err) {
          if (err instanceof Error && err.message === "RateLimited") throw err;
          // Infrastructure failure (e.g. DB unreachable). Log a sanitized id
          // server-side; surface a distinguishable, non-leaky code to the UI.
          const ref = Math.abs(
            (email + String((err as Error)?.name)).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7),
          ).toString(36);
          console.error(
            `[auth] authorize infrastructure error ref=${ref} name=${(err as Error)?.name ?? "unknown"}`,
          );
          throw new Error("ServiceUnavailable");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const membership = await prisma.organizationMember.findFirst({
          where: { userId: user.id },
          include: { role: true },
        });
        token.sub = user.id;
        token.organizationId = membership?.organizationId;
        token.role = membership?.role.key;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.organizationId = (token.organizationId as string) ?? "";
        session.role = token.role as string | undefined;
      }
      return session;
    },
  },
  secret: authSecret(),
};
