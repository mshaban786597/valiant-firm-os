/**
 * Remove the pilot fixture rows (everything flagged `isDemo` in the database)
 * and the records that exist only because of them.
 *
 *   npx tsx scripts/remove-fixtures.ts            # report only, no writes
 *   npx tsx scripts/remove-fixtures.ts --confirm  # back up, then delete
 *
 * Safety:
 *  - Report only by default. Deleting needs --confirm.
 *  - Every row that will go is first written to backups/fixtures-<time>.json.
 *  - One transaction: all of it goes or none of it does.
 *  - A flagged client or lead that has real work attached (an invoice, a
 *    website, a store, an enquiry, a contact) stops the run instead of
 *    orphaning that work.
 *  - Never touches rows that are not flagged and not owned by a flagged row.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasourceUrl: /connect_timeout=/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}connect_timeout=60&pool_timeout=60`,
});

type Rows = Record<string, unknown>[];
const ids = (rows: Rows) => rows.map((r) => String(r.id));
const within = (list: string[]) => ({ in: list });

async function collect() {
  const flagged = { isDemo: true };
  const [
    leads, deals, clients, tasks, reports, founderAlerts, monitors, incidents, notificationLogs,
    approvals, sends, replies, meetings, releases, expenses, targets, runs,
  ] = await Promise.all([
    prisma.lead.findMany({ where: flagged }),
    prisma.deal.findMany({ where: flagged }),
    prisma.client.findMany({ where: flagged }),
    prisma.task.findMany({ where: flagged }),
    prisma.report.findMany({ where: flagged }),
    prisma.founderAlert.findMany({ where: flagged }),
    prisma.monitor.findMany({ where: flagged }),
    prisma.incident.findMany({ where: flagged }),
    prisma.notificationLog.findMany({ where: flagged }),
    prisma.approvalRequest.findMany({ where: flagged }),
    prisma.outreachSend.findMany({ where: flagged }),
    prisma.outreachReply.findMany({ where: flagged }),
    prisma.meeting.findMany({ where: flagged }),
    prisma.releaseVerification.findMany({ where: flagged }),
    prisma.expense.findMany({ where: flagged }),
    prisma.prospectTarget.findMany({ where: flagged }),
    prisma.prospectingRun.findMany({ where: flagged }),
  ]);

  const clientIds = ids(clients);
  const leadIds = ids(leads);
  const monitorIds = ids(monitors);
  const incidentIds = ids(incidents);
  const byClient = { clientId: within(clientIds) };
  const byLead = { leadId: within(leadIds) };

  // Rows that exist only as part of a flagged client, lead, check or incident.
  const [
    onboardingItems, contentItems, keywords, healthSnapshots, portalTokens, campaigns, clientTasks, clientReports,
    leadScores, outreachMessages, leadEvidence, leadSends, leadReplies, monitorChecks, incidentEvents,
  ] = await Promise.all([
    prisma.onboardingItem.findMany({ where: byClient }),
    prisma.contentItem.findMany({ where: byClient }),
    prisma.keyword.findMany({ where: byClient }),
    prisma.healthScoreSnapshot.findMany({ where: byClient }),
    prisma.clientPortalToken.findMany({ where: byClient }),
    prisma.campaign.findMany({ where: byClient }),
    prisma.task.findMany({ where: { ...byClient, isDemo: false } }),
    prisma.report.findMany({ where: { ...byClient, isDemo: false } }),
    prisma.leadScore.findMany({ where: byLead }),
    prisma.outreachMessage.findMany({ where: byLead }),
    prisma.leadEvidence.findMany({ where: byLead }),
    prisma.outreachSend.findMany({ where: { ...byLead, isDemo: false } }),
    prisma.outreachReply.findMany({ where: { ...byLead, isDemo: false } }),
    prisma.monitorCheck.findMany({ where: { monitorId: within(monitorIds) } }),
    prisma.incidentEvent.findMany({ where: { incidentId: within(incidentIds) } }),
  ]);

  // Real work that must not be attached to a fixture. Any hit stops the run.
  const [invoices, gbp, gsc, ads, contacts, stores, ga4, sites, enquiries, liveMonitors, liveIncidents, liveDeals] =
    await Promise.all([
      prisma.invoice.count({ where: byClient }),
      prisma.gbpLocation.count({ where: byClient }),
      prisma.gscProperty.count({ where: byClient }),
      prisma.googleAdsCampaign.count({ where: byClient }),
      prisma.contact.count({ where: byClient }),
      prisma.ecommerceStore.count({ where: byClient }),
      prisma.ga4Property.count({ where: byClient }),
      prisma.site.count({ where: byClient }),
      prisma.siteLead.count({ where: byClient }),
      prisma.monitor.count({ where: { ...byClient, isDemo: false } }),
      prisma.incident.count({ where: { isDemo: false, OR: [byClient, { monitorId: within(monitorIds) }] } }),
      prisma.deal.count({ where: { isDemo: false, OR: [byClient, byLead] } }),
    ]);

  return {
    flagged: {
      leads, deals, clients, tasks, reports, founderAlerts, monitors, incidents, notificationLogs,
      approvals, sends, replies, meetings, releases, expenses, targets, runs,
    },
    owned: {
      onboardingItems, contentItems, keywords, healthSnapshots, portalTokens, campaigns, clientTasks, clientReports,
      leadScores, outreachMessages, leadEvidence, leadSends, leadReplies, monitorChecks, incidentEvents,
    },
    attached: {
      invoices, "Google Business locations": gbp, "Search Console properties": gsc, "Google Ads campaigns": ads,
      contacts, stores, "Analytics properties": ga4, websites: sites, "website enquiries": enquiries,
      "live checks": liveMonitors, "live incidents": liveIncidents, "live deals": liveDeals,
    },
  };
}

type Plan = Awaited<ReturnType<typeof collect>>;

const label = (r: Record<string, unknown>) =>
  String(r.businessName ?? r.name ?? r.title ?? r.subject ?? r.keyword ?? r.month ?? r.id);

function report(plan: Plan) {
  let total = 0;
  console.log("\nFlagged fixture rows");
  for (const [name, rows] of Object.entries(plan.flagged)) {
    if (!rows.length) continue;
    total += rows.length;
    const sample = (rows as Rows).slice(0, 4).map(label).join(" | ");
    console.log(`  ${name.padEnd(18)} ${String(rows.length).padStart(5)}  ${sample}`);
  }
  console.log("\nRows that exist only because of them");
  for (const [name, rows] of Object.entries(plan.owned)) {
    if (!rows.length) continue;
    total += rows.length;
    console.log(`  ${name.padEnd(18)} ${String(rows.length).padStart(5)}`);
  }
  const blockers = Object.entries(plan.attached).filter(([, n]) => n > 0);
  console.log("\nReal work attached to a fixture (must be zero)");
  if (blockers.length === 0) console.log("  none");
  for (const [name, n] of blockers) console.log(`  ${name.padEnd(26)} ${n}`);
  console.log(`\nTOTAL rows to delete: ${total}`);
  return { total, blocked: blockers.length > 0 };
}

async function remove(plan: Plan) {
  const f = plan.flagged;
  const o = plan.owned;
  const byId = (rows: Rows) => ({ id: within(ids(rows)) });
  await prisma.$transaction(
    async (tx) => {
      // Children first, then the rows they hang off.
      await tx.incidentEvent.deleteMany({ where: byId(o.incidentEvents) });
      await tx.monitorCheck.deleteMany({ where: byId(o.monitorChecks) });
      await tx.leadScore.deleteMany({ where: byId(o.leadScores) });
      await tx.outreachMessage.deleteMany({ where: byId(o.outreachMessages) });
      await tx.leadEvidence.deleteMany({ where: byId(o.leadEvidence) });
      await tx.outreachSend.deleteMany({ where: byId([...f.sends, ...o.leadSends]) });
      await tx.outreachReply.deleteMany({ where: byId([...f.replies, ...o.leadReplies]) });
      await tx.meeting.deleteMany({ where: byId(f.meetings) });
      await tx.approvalRequest.deleteMany({ where: byId(f.approvals) });
      await tx.notificationLog.deleteMany({ where: byId(f.notificationLogs) });
      await tx.releaseVerification.deleteMany({ where: byId(f.releases) });
      await tx.expense.deleteMany({ where: byId(f.expenses) });
      await tx.prospectingRun.deleteMany({ where: byId(f.runs) });
      await tx.prospectTarget.deleteMany({ where: byId(f.targets) });
      await tx.incident.deleteMany({ where: byId(f.incidents) });
      await tx.monitor.deleteMany({ where: byId(f.monitors) });
      await tx.founderAlert.deleteMany({ where: byId(f.founderAlerts) });
      await tx.task.deleteMany({ where: byId([...f.tasks, ...o.clientTasks]) });
      await tx.report.deleteMany({ where: byId([...f.reports, ...o.clientReports]) });
      await tx.onboardingItem.deleteMany({ where: byId(o.onboardingItems) });
      await tx.contentItem.deleteMany({ where: byId(o.contentItems) });
      await tx.keyword.deleteMany({ where: byId(o.keywords) });
      await tx.healthScoreSnapshot.deleteMany({ where: byId(o.healthSnapshots) });
      await tx.clientPortalToken.deleteMany({ where: byId(o.portalTokens) });
      await tx.campaign.deleteMany({ where: byId(o.campaigns) });
      await tx.deal.deleteMany({ where: byId(f.deals) });
      await tx.client.deleteMany({ where: byId(f.clients) });
      await tx.lead.deleteMany({ where: byId(f.leads) });
    },
    { maxWait: 30000, timeout: 120000 },
  );
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const plan = await collect();
  const { total, blocked } = report(plan);

  if (total === 0) {
    console.log("\nNothing flagged. Nothing to do.\n");
    return;
  }
  if (blocked) {
    console.log("\nStopped: real work is attached to a fixture. Nothing was changed.\n");
    process.exitCode = 2;
    return;
  }
  if (!confirm) {
    console.log("\nReport only. Nothing was changed. Run again with --confirm to back up and delete.\n");
    return;
  }

  mkdirSync("backups", { recursive: true });
  const file = `backups/fixtures-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), ...plan }, null, 2));
  console.log(`\nBacked up ${total} rows to ${file}`);
  await remove(plan);

  const left = await collect();
  const after = Object.values(left.flagged).reduce((n, rows) => n + rows.length, 0);
  console.log(`Deleted. Flagged rows left: ${after}\n`);
  if (after !== 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
