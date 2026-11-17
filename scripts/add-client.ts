/**
 * Add a live client and attach what is already known about its website
 * (checks, Search Console, Analytics, open incidents).
 *
 *   npx tsx --env-file=.env scripts/add-client.ts "Client name" https://site.com --monthly 1700 [--service "Local SEO"] [--location "Tallahassee, FL"]
 *
 * Running it again for the same name updates the client instead of adding another.
 */
import { ClientStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ensureOnboardingChecklist } from "../src/lib/onboarding";
import { linkSiteToClient } from "../src/lib/clients/link-site";
import { writeAuditLog } from "../src/lib/audit";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const [name, websiteUrl] = process.argv.slice(2);
  const monthly = flag("monthly");
  if (!name || !websiteUrl || name.startsWith("--") || !/^https?:\/\//.test(websiteUrl)) {
    throw new Error('Usage: add-client "Client name" https://site.com --monthly 1700');
  }
  if (monthly !== undefined && !(Number(monthly) > 0)) throw new Error("--monthly must be a positive number");

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "valiant-firm" }, select: { id: true } });
  const location = flag("location");
  const data = {
    websiteUrl: websiteUrl.replace(/\/$/, ""),
    status: ClientStatus.Active,
    ...(monthly !== undefined ? { monthlyValue: Number(monthly) } : {}),
    ...(flag("service") ? { servicePurchased: flag("service") } : {}),
    ...(location ? { targetLocations: [location] } : {}),
  };
  const existing = await prisma.client.findFirst({ where: { organizationId: org.id, isDemo: false, businessName: name }, select: { id: true } });
  const client = existing
    ? await prisma.client.update({ where: { id: existing.id }, data })
    : await prisma.client.create({ data: { organizationId: org.id, isDemo: false, businessName: name, ...data } });
  await ensureOnboardingChecklist(org.id, client.id);
  const linked = await linkSiteToClient({ organizationId: org.id, clientId: client.id, websiteUrl });
  await writeAuditLog({
    organizationId: org.id,
    action: existing ? "client.update" : "client.create",
    entity: "Client",
    entityId: client.id,
    meta: { source: "scripts/add-client", ...linked },
  });

  console.log(`${existing ? "Updated" : "Added"} client: ${client.businessName} (${client.websiteUrl})`);
  console.log(`  monthly: ${client.monthlyValue ?? "not set"} | status: ${client.status}`);
  console.log(
    `  linked: ${linked.monitors} checks, ${linked.gscProperties} Search Console, ${linked.ga4Properties} Analytics, ${linked.incidents} open incidents, ${linked.tasksCreated} tasks created`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
