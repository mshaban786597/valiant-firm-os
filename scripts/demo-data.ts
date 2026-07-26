/**
 * Demo-data audit & cleanup tool for Valiant Firm Agency OS.
 *
 *   npm run data:audit-demo              # dry-run report only (no writes)
 *   npm run data:clean-demo              # dry-run (safe default)
 *   npm run data:clean-demo -- --confirm # back up + delete demo rows
 *
 * SAFETY:
 *  - Read-only by default. Deletion requires the explicit --confirm flag.
 *  - Backs up every row it will delete to backups/demo-backup-<ts>.json first.
 *  - Runs deletions inside a single transaction (all-or-nothing).
 *  - Idempotent: re-running after a clean finds nothing and deletes nothing.
 *  - Never touches system records (org, roles, founder user, membership,
 *    settings, workflows) or the SaaS Roadmap (strategic planning content).
 *
 * Demo detection is marker-based, NOT "delete everything":
 *  - Leads / Clients: email or website on an `.example` domain.
 *  - Deals: linked to a demo lead, or business name matches a demo business.
 *  - Child records: linked (by clientId / leadId) to a demo client/lead.
 *  - AutomationLog: seeded demo automation names (real runs use `workflow:<id>`).
 *  - AiLog: relatedRecord points at a demo lead (real logs point at real records).
 *  - RankRentAsset: `.example` domain.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG_SLUG = "valiant-firm";
const EXAMPLE = ".example";

// Seeded demo automation names (see prisma/seed.ts). Real executions are logged
// by the engine with trigger `workflow:<uuid>`, so these labels are demo-only.
const DEMO_AUTOMATION_NAMES = [
  "New Lead to AI Score",
  "Qualified Lead to Outreach",
  "Positive Reply to Call Booking",
  "Stripe Payment to Onboarding",
  "Monthly SEO Data Pull",
  "Health Score Drop to Retention",
];

function containsExample(...vals: (string | null | undefined)[]) {
  return vals.some((v) => typeof v === "string" && v.toLowerCase().includes(EXAMPLE));
}

interface Plan {
  orgId: string;
  leadIds: string[];
  clientIds: string[];
  dealIds: string[];
  taskIds: string[];
  reportIds: string[];
  contentIds: string[];
  keywordIds: string[];
  healthSnapshotIds: string[];
  onboardingItemIds: string[];
  invoiceIds: string[];
  founderAlertIds: string[];
  leadScoreIds: string[];
  outreachIds: string[];
  automationLogIds: string[];
  aiLogIds: string[];
  rankRentIds: string[];
  gbpIds: string[];
  gscIds: string[];
  adsIds: string[];
  labels: Record<string, string[]>;
}

async function buildPlan(): Promise<Plan | null> {
  const org = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });
  if (!org) {
    console.error(`Organization "${ORG_SLUG}" not found — nothing to do.`);
    return null;
  }
  const orgId = org.id;
  const scope = { organizationId: orgId };

  // --- Leads on .example domains ------------------------------------------
  const leads = await prisma.lead.findMany({
    where: scope,
    select: { id: true, businessName: true, email: true, websiteUrl: true },
  });
  const demoLeads = leads.filter((l) => containsExample(l.email, l.websiteUrl));
  const leadIds = demoLeads.map((l) => l.id);
  const demoBusinessNames = new Set(demoLeads.map((l) => l.businessName));

  // --- Clients on .example domains ----------------------------------------
  const clients = await prisma.client.findMany({
    where: scope,
    select: { id: true, businessName: true, email: true, websiteUrl: true },
  });
  const demoClients = clients.filter((c) => containsExample(c.email, c.websiteUrl));
  const clientIds = demoClients.map((c) => c.id);
  demoClients.forEach((c) => demoBusinessNames.add(c.businessName));

  // --- Deals linked to demo leads or matching a demo business name --------
  const deals = await prisma.deal.findMany({
    where: scope,
    select: { id: true, businessName: true, leadId: true },
  });
  const demoDeals = deals.filter(
    (d) => (d.leadId && leadIds.includes(d.leadId)) || demoBusinessNames.has(d.businessName),
  );
  const dealIds = demoDeals.map((d) => d.id);

  const byClient = clientIds.length ? { clientId: { in: clientIds } } : { clientId: "__none__" };
  const byLead = leadIds.length ? { leadId: { in: leadIds } } : { leadId: "__none__" };

  // --- Child records ------------------------------------------------------
  const [
    tasks, reports, content, keywords, health, onboarding, invoices,
    founderAlerts, leadScores, outreach, gbps, gscs, ads,
  ] = await Promise.all([
    prisma.task.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.report.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.contentItem.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.keyword.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.healthScoreSnapshot.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.onboardingItem.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.invoice.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.founderAlert.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.leadScore.findMany({ where: { ...scope, ...byLead }, select: { id: true } }),
    prisma.outreachMessage.findMany({ where: { ...scope, ...byLead }, select: { id: true } }),
    prisma.gbpLocation.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.gscProperty.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
    prisma.googleAdsCampaign.findMany({ where: { ...scope, ...byClient }, select: { id: true } }),
  ]);

  // --- Org-scoped demo logs & rank-and-rent -------------------------------
  const automationLogs = await prisma.automationLog.findMany({
    where: { ...scope, name: { in: DEMO_AUTOMATION_NAMES } },
    select: { id: true },
  });
  const aiLogs = leadIds.length
    ? await prisma.aiLog.findMany({
        where: { ...scope, relatedRecord: { in: leadIds } },
        select: { id: true },
      })
    : [];
  const rankRent = await prisma.rankRentAsset.findMany({
    where: scope,
    select: { id: true, domain: true },
  });
  const demoRankRent = rankRent.filter((r) => containsExample(r.domain));

  return {
    orgId,
    leadIds,
    clientIds,
    dealIds,
    taskIds: tasks.map((t) => t.id),
    reportIds: reports.map((r) => r.id),
    contentIds: content.map((c) => c.id),
    keywordIds: keywords.map((k) => k.id),
    healthSnapshotIds: health.map((h) => h.id),
    onboardingItemIds: onboarding.map((o) => o.id),
    invoiceIds: invoices.map((i) => i.id),
    founderAlertIds: founderAlerts.map((f) => f.id),
    leadScoreIds: leadScores.map((s) => s.id),
    outreachIds: outreach.map((o) => o.id),
    automationLogIds: automationLogs.map((a) => a.id),
    aiLogIds: aiLogs.map((a) => a.id),
    rankRentIds: demoRankRent.map((r) => r.id),
    gbpIds: gbps.map((g) => g.id),
    gscIds: gscs.map((g) => g.id),
    adsIds: ads.map((a) => a.id),
    labels: {
      leads: demoLeads.map((l) => `${l.businessName} <${l.email ?? "?"}>`),
      clients: demoClients.map((c) => c.businessName),
      deals: demoDeals.map((d) => d.businessName),
      rankRent: demoRankRent.map((r) => r.domain),
    },
  };
}

function report(plan: Plan) {
  const rows: [string, number, string][] = [
    ["Lead", plan.leadIds.length, plan.labels.leads.slice(0, 3).join(", ")],
    ["Client", plan.clientIds.length, plan.labels.clients.join(", ")],
    ["Deal", plan.dealIds.length, plan.labels.deals.join(", ")],
    ["Task", plan.taskIds.length, "child of demo clients"],
    ["Report", plan.reportIds.length, "child of demo clients"],
    ["ContentItem", plan.contentIds.length, "child of demo clients"],
    ["Keyword", plan.keywordIds.length, "child of demo clients"],
    ["HealthScoreSnapshot", plan.healthSnapshotIds.length, "child of demo clients"],
    ["OnboardingItem", plan.onboardingItemIds.length, "child of demo clients"],
    ["Invoice", plan.invoiceIds.length, "child of demo clients"],
    ["FounderAlert", plan.founderAlertIds.length, "child of demo clients"],
    ["LeadScore", plan.leadScoreIds.length, "child of demo leads"],
    ["OutreachMessage", plan.outreachIds.length, "child of demo leads"],
    ["GbpLocation", plan.gbpIds.length, "child of demo clients"],
    ["GscProperty", plan.gscIds.length, "child of demo clients"],
    ["GoogleAdsCampaign", plan.adsIds.length, "child of demo clients"],
    ["AutomationLog", plan.automationLogIds.length, "seeded demo automation names"],
    ["AiLog", plan.aiLogIds.length, "logs referencing demo leads"],
    ["RankRentAsset", plan.rankRentIds.length, plan.labels.rankRent.join(", ")],
  ];
  const total = rows.reduce((n, r) => n + r[1], 0);

  console.log("\n=== DEMO DATA AUDIT (dry-run) ===");
  console.log("Table                    Count  Identifying values");
  console.log("-----------------------  -----  ------------------------------------");
  for (const [table, count, ids] of rows) {
    if (count > 0) {
      console.log(`${table.padEnd(23)}  ${String(count).padStart(5)}  ${ids}`);
    }
  }
  console.log("-----------------------  -----");
  console.log(`${"TOTAL demo rows".padEnd(23)}  ${String(total).padStart(5)}`);
  console.log("\nPRESERVED (never touched): Organization, Role, User,");
  console.log("OrganizationMember, Setting, Workflow, SaasProduct (SaaS Roadmap).");
  return { rows, total };
}

async function backup(plan: Plan) {
  const scope = { organizationId: plan.orgId };
  const data = {
    generatedAt: new Date().toISOString(),
    organizationId: plan.orgId,
    leads: await prisma.lead.findMany({ where: { id: { in: plan.leadIds } } }),
    clients: await prisma.client.findMany({ where: { id: { in: plan.clientIds } } }),
    deals: await prisma.deal.findMany({ where: { id: { in: plan.dealIds } } }),
    tasks: await prisma.task.findMany({ where: { id: { in: plan.taskIds } } }),
    reports: await prisma.report.findMany({ where: { id: { in: plan.reportIds } } }),
    contentItems: await prisma.contentItem.findMany({ where: { id: { in: plan.contentIds } } }),
    keywords: await prisma.keyword.findMany({ where: { id: { in: plan.keywordIds } } }),
    healthSnapshots: await prisma.healthScoreSnapshot.findMany({ where: { id: { in: plan.healthSnapshotIds } } }),
    onboardingItems: await prisma.onboardingItem.findMany({ where: { id: { in: plan.onboardingItemIds } } }),
    invoices: await prisma.invoice.findMany({ where: { id: { in: plan.invoiceIds } } }),
    founderAlerts: await prisma.founderAlert.findMany({ where: { id: { in: plan.founderAlertIds } } }),
    leadScores: await prisma.leadScore.findMany({ where: { id: { in: plan.leadScoreIds } } }),
    outreach: await prisma.outreachMessage.findMany({ where: { id: { in: plan.outreachIds } } }),
    automationLogs: await prisma.automationLog.findMany({ where: { id: { in: plan.automationLogIds } } }),
    aiLogs: await prisma.aiLog.findMany({ where: { id: { in: plan.aiLogIds } } }),
    rankRentAssets: await prisma.rankRentAsset.findMany({ where: { id: { in: plan.rankRentIds } } }),
    gbpLocations: await prisma.gbpLocation.findMany({ where: { id: { in: plan.gbpIds } } }),
    gscProperties: await prisma.gscProperty.findMany({ where: { id: { in: plan.gscIds } } }),
    googleAdsCampaigns: await prisma.googleAdsCampaign.findMany({ where: { id: { in: plan.adsIds } } }),
  };
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `backups/demo-backup-${stamp}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2));
  void scope;
  return path;
}

async function clean(plan: Plan) {
  const inIds = (ids: string[]) => ({ id: { in: ids } });
  // Children first, then parents (explicit order — no reliance on cascade).
  // Generous timeouts: Neon is serverless, so each round-trip has latency.
  await prisma.$transaction(async (tx) => {
    await tx.leadScore.deleteMany({ where: inIds(plan.leadScoreIds) });
    await tx.outreachMessage.deleteMany({ where: inIds(plan.outreachIds) });
    await tx.task.deleteMany({ where: inIds(plan.taskIds) });
    await tx.contentItem.deleteMany({ where: inIds(plan.contentIds) });
    await tx.keyword.deleteMany({ where: inIds(plan.keywordIds) });
    await tx.report.deleteMany({ where: inIds(plan.reportIds) });
    await tx.healthScoreSnapshot.deleteMany({ where: inIds(plan.healthSnapshotIds) });
    await tx.onboardingItem.deleteMany({ where: inIds(plan.onboardingItemIds) });
    await tx.founderAlert.deleteMany({ where: inIds(plan.founderAlertIds) });
    await tx.gbpLocation.deleteMany({ where: inIds(plan.gbpIds) });
    await tx.gscProperty.deleteMany({ where: inIds(plan.gscIds) });
    await tx.googleAdsCampaign.deleteMany({ where: inIds(plan.adsIds) });
    // Invoice line items cascade from invoices, but delete explicitly to be safe.
    if (plan.invoiceIds.length) {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: { in: plan.invoiceIds } } });
      await tx.invoice.deleteMany({ where: inIds(plan.invoiceIds) });
    }
    await tx.deal.deleteMany({ where: inIds(plan.dealIds) });
    await tx.client.deleteMany({ where: inIds(plan.clientIds) });
    await tx.lead.deleteMany({ where: inIds(plan.leadIds) });
    await tx.automationLog.deleteMany({ where: inIds(plan.automationLogIds) });
    await tx.aiLog.deleteMany({ where: inIds(plan.aiLogIds) });
    await tx.rankRentAsset.deleteMany({ where: inIds(plan.rankRentIds) });
  }, { maxWait: 15000, timeout: 60000 });
}

async function main() {
  const args = process.argv.slice(2);
  const doClean = args.includes("--clean");
  const confirm = args.includes("--confirm");

  const plan = await buildPlan();
  if (!plan) return;

  const { total } = report(plan);

  if (!doClean) {
    console.log("\n(audit only — no changes made)\n");
    return;
  }
  if (total === 0) {
    console.log("\nNo demo rows found. Nothing to clean (idempotent no-op).\n");
    return;
  }
  if (!confirm) {
    console.log("\nDRY RUN. Re-run with `--confirm` to back up and delete the above.\n");
    return;
  }

  const backupPath = await backup(plan);
  console.log(`\nBacked up ${total} demo rows to ${backupPath}`);
  await clean(plan);
  console.log(`Deleted ${total} demo rows inside a transaction. Cleanup complete.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
