/**
 * End-to-end pilot runner (master prompt Phase 2). Runs BOTH pilots against the
 * real database with clearly-labeled "[PILOT]" / ".example" demo data and prints
 * evidence. Idempotent: it cleans prior pilot data first, so re-running is safe.
 *
 *   npm run pilots          # run both pilots + print evidence
 *   npm run pilots -- --clean   # only remove pilot data
 *
 * Pilot data is isolated by the "[PILOT]" name prefix + ".example" domains and
 * is removable with this script's --clean or `npm run data:clean-demo`.
 */
import {
  DealStage,
  LeadStatus,
  MonitorType,
  PrismaClient,
} from "@prisma/client";
import { completeDealWonHandoff } from "@/lib/deal-handoff";
import { recordCheckResult } from "@/lib/monitoring/incidents";
import { computeLeadScore } from "@/lib/ai/compute-lead-score";
import { mapLeadToScoreInput } from "@/lib/mappers/lead";

const prisma = new PrismaClient();
const PILOT = "[PILOT]";

async function cleanPilotData(orgId: string) {
  // Monitors cascade their checks/incidents/events.
  await prisma.monitor.deleteMany({ where: { organizationId: orgId, name: { startsWith: PILOT } } });
  // Any stray pilot incidents not tied to a deleted monitor.
  await prisma.incident.deleteMany({ where: { organizationId: orgId, title: { contains: PILOT } } });
  // Clients cascade onboarding + tasks; deals SetNull then delete by name.
  await prisma.deal.deleteMany({ where: { organizationId: orgId, businessName: { startsWith: PILOT } } });
  await prisma.task.deleteMany({ where: { organizationId: orgId, title: { contains: PILOT } } });
  await prisma.client.deleteMany({ where: { organizationId: orgId, businessName: { startsWith: PILOT } } });
  await prisma.lead.deleteMany({ where: { organizationId: orgId, businessName: { startsWith: PILOT } } });
}

async function salesPilot(orgId: string) {
  console.log("\n=== SALES & OUTREACH PILOT ===");
  // 1. Lead
  const lead = await prisma.lead.create({
    data: {
      organizationId: orgId,
      businessName: `${PILOT} Panama City Gutter Co`,
      niche: "Gutters",
      city: "Panama City",
      state: "FL",
      websiteUrl: "https://pcgutters.example",
      email: "owner@pcgutters.example",
      phone: "8505550101",
      source: "Outbound / pilot",
      gbpStatus: "Incomplete categories",
      websiteStatus: "No dedicated gutter repair page",
      weaknessTags: ["thin_content", "no_schema"],
      status: LeadStatus.Raw,
    },
  });
  console.log(` 1. Lead created: ${lead.businessName} (${lead.id})`);

  // 2. Score (deterministic fallback when no AI key)
  const { provider, score } = await computeLeadScore(mapLeadToScoreInput(lead));
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      leadScore: score.composite_score,
      recommendedOffer: score.recommended_offer,
      outreachAngle: score.outreach_angle,
      status: LeadStatus.Qualified,
    },
  });
  console.log(` 2. Scored: ${score.composite_score}/100 via ${provider}; offer="${score.recommended_offer}"`);

  // 3-4. Verified finding → outreach → reply → booking (recorded on the lead)
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      sequenceStartedAt: new Date(),
      status: LeadStatus.InSequence,
      manualReplied: true,
      manualBooked: true,
    },
  });
  console.log(" 3. Finding + outreach sent, positive reply + booking recorded");

  // 5. Deal → Closed Won → handoff
  const deal = await prisma.deal.create({
    data: {
      organizationId: orgId,
      leadId: lead.id,
      businessName: lead.businessName,
      contactName: "Casey (pilot)",
      serviceInterest: "Local SEO + GBP",
      monthlyValue: 1500,
      stage: DealStage.ProposalSent,
    },
  });
  console.log(` 4. Deal created: ${deal.id} (ProposalSent)`);

  const dealForHandoff = await prisma.deal.findUniqueOrThrow({
    where: { id: deal.id },
    include: { lead: true },
  });
  const h1 = await completeDealWonHandoff({
    organizationId: orgId,
    deal: {
      id: dealForHandoff.id,
      businessName: dealForHandoff.businessName,
      contactName: dealForHandoff.contactName,
      serviceInterest: dealForHandoff.serviceInterest,
      monthlyValue: dealForHandoff.monthlyValue,
      leadId: dealForHandoff.leadId,
      clientId: dealForHandoff.clientId,
    },
    lead: dealForHandoff.lead
      ? { email: dealForHandoff.lead.email, phone: dealForHandoff.lead.phone, websiteUrl: dealForHandoff.lead.websiteUrl }
      : null,
  });
  await prisma.deal.update({ where: { id: deal.id }, data: { stage: DealStage.ClosedWon } });
  console.log(` 5. Deal Won → handoff: created=${h1.created}, clientId=${h1.clientId}`);

  // 6. Replay (idempotency evidence)
  const reRead = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { lead: true } });
  const h2 = await completeDealWonHandoff({
    organizationId: orgId,
    deal: {
      id: reRead.id, businessName: reRead.businessName, contactName: reRead.contactName,
      serviceInterest: reRead.serviceInterest, monthlyValue: reRead.monthlyValue,
      leadId: reRead.leadId, clientId: reRead.clientId,
    },
    lead: reRead.lead ? { email: reRead.lead.email, phone: reRead.lead.phone, websiteUrl: reRead.lead.websiteUrl } : null,
  });
  const clientCount = await prisma.client.count({ where: { organizationId: orgId, businessName: lead.businessName } });
  const onboardingCount = h1.clientId ? await prisma.onboardingItem.count({ where: { clientId: h1.clientId } }) : 0;
  console.log(` 6. Replay Deal Won → created=${h2.created} (reason=${h2.reason})`);
  console.log(`    EVIDENCE: clients for this deal = ${clientCount} (expect 1); onboarding items = ${onboardingCount}`);
  return { clientId: h1.clientId, ok: clientCount === 1 };
}

async function clientOpsPilot(orgId: string, clientId: string | null) {
  console.log("\n=== CLIENT OPERATIONS PILOT (incident lifecycle) ===");
  const monitor = await prisma.monitor.create({
    data: {
      organizationId: orgId,
      clientId,
      name: `${PILOT} Lead route — contact form`,
      type: MonitorType.LEAD_ROUTE,
      target: "https://pcgutters.example/contact",
      cadenceMinutes: 15,
    },
  });
  console.log(` 1. Monitor created: ${monitor.name} (${monitor.id})`);

  const o1 = await recordCheckResult(monitor, { status: "fail", detail: "Form POST returned 500; lead not delivered", statusCode: 500 });
  console.log(` 2. Simulated failure → ${o1.action}, incident=${o1.incidentId}`);

  const o2 = await recordCheckResult(monitor, { status: "fail", detail: "Still failing", statusCode: 500 });
  console.log(` 3. Repeat failure → ${o2.action} (folds into same incident=${o2.incidentId})`);

  const incident = o1.incidentId
    ? await prisma.incident.findUnique({ where: { id: o1.incidentId }, include: { events: true } })
    : null;
  console.log(`    EVIDENCE: occurrenceCount=${incident?.occurrenceCount}, task=${incident?.taskId}, events=${incident?.events.length}`);

  const o3 = await recordCheckResult(monitor, { status: "ok", detail: "Form POST 200; lead delivered" });
  const resolved = o1.incidentId ? await prisma.incident.findUnique({ where: { id: o1.incidentId }, select: { status: true } }) : null;
  console.log(` 4. Recovery check → ${o3.action}; incident status now = ${resolved?.status} (expect RESOLVED)`);
  return { ok: resolved?.status === "RESOLVED" && incident?.occurrenceCount === 2 };
}

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "valiant-firm" }, select: { id: true } });
  if (!org) throw new Error("Organization 'valiant-firm' not found — run db:seed first.");

  await cleanPilotData(org.id);
  if (process.argv.includes("--clean")) {
    console.log("Pilot data cleaned.");
    return;
  }

  const sales = await salesPilot(org.id);
  const ops = await clientOpsPilot(org.id, sales.clientId);

  console.log("\n=== PILOT RESULTS ===");
  console.log(` Sales pilot (one onboarding on replay): ${sales.ok ? "PASS" : "FAIL"}`);
  console.log(` Client Ops pilot (incident dedupe + resolve): ${ops.ok ? "PASS" : "FAIL"}`);
  console.log(" Pilot data is labeled [PILOT] / .example and removable with: npm run pilots -- --clean\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
