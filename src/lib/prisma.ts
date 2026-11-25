import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * The database is serverless: its compute can be asleep and take longer than
 * Prisma's default 5 seconds to accept a connection, which showed up as
 * "Can't reach database server" on a first request. Give it time to wake, and
 * give a busy pool time to hand out a connection. A value already set in
 * DATABASE_URL is left as it is.
 */
export function withConnectionPatience(url: string | undefined): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) return url;
  let out = url;
  const add = (key: string, value: string) => {
    if (new RegExp(`[?&]${key}=`).test(out)) return;
    out += `${out.indexOf("?") === -1 ? "?" : "&"}${key}=${value}`;
  };
  add("connect_timeout", "30");
  add("pool_timeout", "30");
  return out;
}

const datasourceUrl = withConnectionPatience(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
