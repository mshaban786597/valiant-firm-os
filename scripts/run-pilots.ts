/**
 * End-to-end pilots, run against the real database in the DEMO scope
 * (isDemo = true, labeled "[PILOT]"). They call the same library functions the
 * API routes call, and print evidence with record ids.
 *
 *   npm run pilots              # reset the fixture, run both pilots, print evidence
 *   npm run pilots -- --clean   # only remove the pilot fixture
 *
 * Nothing leaves the app: demo sends use the test sender and demo alerts are
 * logged as "not attempted". The audit log is never touched, so history keeps
 * its timestamps.
 */
import { ApprovalStatus, DealStage, LeadStatus, MonitorType, PrismaClient, TaskStatus } from "@prisma/client";
import { attachHandoffContext, completeDealWonHandoff } from "@/lib/deal-handoff";
import { recordCheckResult } from "@/lib/monitoring/incidents";
import { getMonitoringSummary } from "@/lib/monitoring/summary";
import { describeOutcome } from "@/lib/monitoring/state";
import { computeLeadScore } from "@/lib/ai/compute-lead-score";
import { mapLeadToScoreInput } from "@/lib/mappers/lead";
import { buildOutreachDraft } from "@/lib/outreach/draft";
import { leadDedupeKey } from "@/lib/outreach/sequence";
import {
  processDueSends,
  reconcileSends,
  recordMeetingEvent,
  recordReply,
  salesMetrics,
  startSequence,
  testProvider,
} from "@/lib/outreach/engine";
import { executeChange, proposeChange, rollbackChange, verifyChange } from "@/lib/changes/lifecycle";
import { buildIncidentReport, releaseReportToClient } from "@/lib/reports/incident-report";
import { compareManifests, extractManifest } from "@/lib/release/verify";

const prisma = new PrismaClient();
const PILOT = "[PILOT]";
// Approved test inbox. Plus-addresses keep the opt-out / decline cases off the main address.
const TEST_INBOX = "muhammad@valiantfirm.com";
const OPTOUT_INBOX = "muhammad+optout@valiantfirm.com";
const DECLINE_INBOX = "muhammad+decline@valiantfirm.com";

const results: { name: string; pass: boolean }[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push({ name, pass });
  console.log(`    ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function cleanPilotData(orgId: string) {
  const demo = { organizationId: orgId, isDemo: true };
  await prisma.releaseVerification.deleteMany({ where: demo });
  await prisma.report.deleteMany({ where: demo });
  await prisma.approvalRequest.deleteMany({ where: demo });
  await prisma.founderAlert.deleteMany({ where: demo });
  await prisma.incident.deleteMany({ where: demo });
  await prisma.monitor.deleteMany({ where: demo });
  await prisma.outreachSend.deleteMany({ where: demo });
  await prisma.outreachReply.deleteMany({ where: demo });
  await prisma.meeting.deleteMany({ where: demo });
  await prisma.suppression.deleteMany({
    where: { organizationId: orgId, email: { in: [TEST_INBOX, OPTOUT_INBOX, DECLINE_INBOX] } },
  });
  await prisma.deal.deleteMany({ where: demo });
  await prisma.task.deleteMany({ where: demo });
  await prisma.client.deleteMany({ where: demo });
  await prisma.lead.deleteMany({ where: demo });
}

async function makeProspect(orgId: string, name: string, city: string, email: string) {
  return prisma.lead.create({
    data: {
      organizationId: orgId,
      isDemo: true,
      businessName: `${PILOT} ${name}`,
      niche: "Gutters",
      city,
      state: "FL",
      websiteUrl: "https://pcgutters.example",
      email,
      phone: "8505550101",
      source: "Fixture / pilot",
      gbpStatus: "Incomplete categories",
      websiteStatus: "No dedicated gutter repair page",
      weaknessTags: ["thin_content", "no_schema"],
      status: LeadStatus.Raw,
    },
  });
}

async function approveAndSend(orgId: string, leadId: string, now: Date) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const draft = buildOutreachDraft(lead);
  const approval = await prisma.approvalRequest.create({
    data: {
      organizationId: orgId,
      isDemo: true,
      kind: "outreach_email",
      title: `Outreach email → ${lead.businessName}`,
      body: `To: ${lead.email}\nSubject: ${draft.subject}\n\n${draft.body}`,
      payload: { to: lead.email, subject: draft.subject, body: draft.body },
      entityType: "Lead",
      entityId: lead.id,
    },
  });
  // Same compare-and-set the Approval screen uses.
  const claimed = await prisma.approvalRequest.updateMany({
    where: { id: approval.id, status: ApprovalStatus.PENDING },
    data: { status: ApprovalStatus.APPROVED, decidedAt: now },
  });
  await startSequence({
    organizationId: orgId,
    leadId: lead.id,
    toEmail: lead.email!,
    subject: draft.subject,
    body: draft.body,
    approvalId: approval.id,
    isDemo: true,
    now,
  });
  return { approval, claimed: claimed.count, draft };
}

async function salesPilot(orgId: string) {
  console.log("\n=== SALES & OUTREACH PILOT (demo scope, test sender, test calendar) ===");
  const now = new Date();

  // 1. Discovery + evidence
  const lead = await makeProspect(orgId, "Panama City Gutter Co", "Panama City", TEST_INBOX);
  await prisma.leadEvidence.createMany({
    data: [
      { organizationId: orgId, leadId: lead.id, kind: "rank_observation", provider: "fixture", surface: "organic", query: "gutter repair panama city fl", location: "Panama City, FL", depth: 20, position: 14, finding: "Ranks #14 organically for the main repair query", isFixture: true },
      { organizationId: orgId, leadId: lead.id, kind: "rank_observation", provider: "fixture", surface: "maps", query: "gutter repair panama city fl", location: "Panama City, FL", depth: 20, position: 7, finding: "Ranks #7 in Maps, outside the 3-pack", isFixture: true },
      { organizationId: orgId, leadId: lead.id, kind: "service_verification", provider: "fixture", surface: "site", url: "https://pcgutters.example/services", finding: "Site lists gutter repair as an offered service", isFixture: true },
      { organizationId: orgId, leadId: lead.id, kind: "website_finding", provider: "fixture", surface: "site", url: "https://pcgutters.example", finding: "No dedicated gutter repair page to rank for the repair query", isFixture: true },
      { organizationId: orgId, leadId: lead.id, kind: "contact_source", provider: "fixture", finding: `Contact is the approved test inbox ${TEST_INBOX}`, isFixture: true },
    ],
  });
  const evidence = await prisma.leadEvidence.findMany({ where: { leadId: lead.id } });
  console.log(` 1. Prospect ${lead.id} with ${evidence.length} evidence rows (all labeled fixture)`);
  check("organic and Maps observations are stored separately", evidence.filter((e) => e.surface === "organic").length === 1 && evidence.filter((e) => e.surface === "maps").length === 1);
  check(
    "dedup keeps a branch in another city, merges the same business",
    leadDedupeKey({ businessName: "Panama City Gutter Co LLC", city: "Panama City", state: "FL" }) === leadDedupeKey({ businessName: "panama city gutter co", city: "Panama City", state: "FL" }) &&
      leadDedupeKey({ businessName: "Panama City Gutter Co", city: "Tallahassee", state: "FL" }) !== leadDedupeKey({ businessName: "Panama City Gutter Co", city: "Panama City", state: "FL" }),
  );

  // 2. Qualification + approval
  const { provider, score } = await computeLeadScore(mapLeadToScoreInput(lead));
  await prisma.lead.update({
    where: { id: lead.id },
    data: { leadScore: score.composite_score, recommendedOffer: score.recommended_offer, outreachAngle: score.outreach_angle, status: LeadStatus.Qualified },
  });
  console.log(` 2. Scored ${score.composite_score}/100 via ${provider}`);
  const a = await approveAndSend(orgId, lead.id, now);
  check("approval decided exactly once", a.claimed === 1, `approval ${a.approval.id}`);

  // 3. Send + follow-ups
  const run = await processDueSends({ organizationId: orgId, isDemo: true, now, provider: testProvider });
  const sends = await prisma.outreachSend.findMany({ where: { leadId: lead.id }, orderBy: { step: "asc" } });
  console.log(` 3. Send receipt: provider=${sends[0]?.provider} message=${sends[0]?.providerMessageId} thread=${sends[0]?.threadId}`);
  sends.slice(1).forEach((s) => console.log(`    follow-up ${s.step}: ${s.status}, due ${s.scheduledFor.toISOString().slice(0, 10)}, thread=${s.threadId}`));
  check("first email confirmed by the sender, 2 follow-ups scheduled in the same thread", run.sent === 1 && sends[0]?.status === "sent" && sends.length === 3 && sends[1]?.threadId === sends[0]?.threadId);
  const replay = await startSequence({ organizationId: orgId, leadId: lead.id, toEmail: TEST_INBOX, subject: a.draft.subject, body: a.draft.body, isDemo: true, now });
  const rerun = await processDueSends({ organizationId: orgId, isDemo: true, now, provider: testProvider });
  check("replaying the sequence and the worker sends nothing twice", replay.created === 0 && rerun.sent === 0);

  // 4. Replies + calendar
  const reply = await recordReply({ organizationId: orgId, leadId: lead.id, body: "Sounds good, let's set up a call next week.", threadId: sends[0]?.threadId, isDemo: true });
  console.log(` 4. Reply labeled "${reply.label}"; ${reply.canceledFollowUps} follow-ups canceled`);
  check("positive reply stops both pending follow-ups", reply.label === "interested" && reply.canceledFollowUps === 2);
  const startsAt = new Date(now.getTime() + 3 * 86_400_000);
  const m1 = await recordMeetingEvent({ organizationId: orgId, leadId: lead.id, calendarSource: "test_calendar", externalEventId: "pilot-evt-001", status: "confirmed", startsAt, isDemo: true });
  const m2 = await recordMeetingEvent({ organizationId: orgId, leadId: lead.id, calendarSource: "test_calendar", externalEventId: "pilot-evt-001", status: "rescheduled", startsAt: new Date(startsAt.getTime() + 86_400_000), isDemo: true });
  const m3 = await recordMeetingEvent({ organizationId: orgId, leadId: lead.id, calendarSource: "test_calendar", externalEventId: "pilot-evt-001", status: "attended", startsAt: new Date(startsAt.getTime() + 86_400_000), summary: "Owner wants more repair calls; agreed Local SEO + GBP at $1,500/mo, start with a repair page.", isDemo: true });
  const meetingCount = await prisma.meeting.count({ where: { leadId: lead.id } });
  console.log(`    Booking receipt: test_calendar event pilot-evt-001 → meeting ${m1.meetingId}`);
  check("confirm → reschedule → attended stays one meeting", m1.created && !m2.created && !m3.created && meetingCount === 1);

  // 4b. Opt-out case (also exercises a worker restart mid-send)
  const optOut = await makeProspect(orgId, "Lynn Haven Gutters", "Lynn Haven", OPTOUT_INBOX);
  await approveAndSend(orgId, optOut.id, now);
  let crashed = false;
  try {
    await processDueSends({ organizationId: orgId, isDemo: true, now, provider: testProvider, crashAfterClaims: 1 });
  } catch {
    crashed = true;
  }
  const stuck = await prisma.outreachSend.findFirst({ where: { leadId: optOut.id, step: 0 } });
  const rec = await reconcileSends({ organizationId: orgId, isDemo: true, now, provider: testProvider });
  await processDueSends({ organizationId: orgId, isDemo: true, now, provider: testProvider });
  const afterRestart = await prisma.outreachSend.findMany({ where: { leadId: optOut.id, step: 0 } });
  check(
    "worker restarted mid-send: reconciled with the same key, sent exactly once",
    crashed && stuck?.status === "sending" && rec.reconciled === 1 && afterRestart.length === 1 && afterRestart[0]?.status === "sent",
    `message ${afterRestart[0]?.providerMessageId}`,
  );
  const unsub = await recordReply({ organizationId: orgId, leadId: optOut.id, body: "Please unsubscribe me from this list.", isDemo: true });
  const later = await processDueSends({ organizationId: orgId, isDemo: true, now: new Date(now.getTime() + 30 * 86_400_000), provider: testProvider });
  const suppressed = await prisma.suppression.findFirst({ where: { organizationId: orgId, email: OPTOUT_INBOX } });
  check("opt-out: follow-ups canceled, address suppressed, nothing sent later", unsub.label === "unsubscribe" && unsub.canceledFollowUps === 2 && !!suppressed && later.sent === 0);

  // 4c. Decline case
  const decline = await makeProspect(orgId, "Callaway Gutter Pros", "Callaway", DECLINE_INBOX);
  await approveAndSend(orgId, decline.id, now);
  await processDueSends({ organizationId: orgId, isDemo: true, now, provider: testProvider });
  const no = await recordReply({ organizationId: orgId, leadId: decline.id, body: "Not interested, we already have someone for this.", isDemo: true });
  const pendingAfterDecline = await prisma.outreachSend.count({ where: { leadId: decline.id, status: "scheduled" } });
  check("decline: labeled Not Interested and pending follow-ups canceled", no.label === "not_interested" && no.canceledFollowUps === 2 && pendingAfterDecline === 0);

  // 5. Closed Won → onboarding
  const deal = await prisma.deal.create({
    data: { organizationId: orgId, isDemo: true, leadId: lead.id, businessName: lead.businessName, contactName: "Casey (pilot)", serviceInterest: "Local SEO + GBP", monthlyValue: 1500, stage: DealStage.ProposalSent },
  });
  const full = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { lead: true } });
  const handoffInput = () => ({
    organizationId: orgId,
    isDemo: true,
    deal: { id: full.id, businessName: full.businessName, contactName: full.contactName, serviceInterest: full.serviceInterest, monthlyValue: full.monthlyValue, leadId: full.leadId, clientId: null },
    lead: full.lead ? { email: full.lead.email, phone: full.lead.phone, websiteUrl: full.lead.websiteUrl } : null,
  });
  // Three concurrent Closed Won events.
  const racers = await Promise.all([completeDealWonHandoff(handoffInput()), completeDealWonHandoff(handoffInput()), completeDealWonHandoff(handoffInput())]);
  await prisma.deal.update({ where: { id: deal.id }, data: { stage: DealStage.ClosedWon } });
  const clientId = racers.filter((r) => r.clientId)[0]!.clientId!;
  const ctx1 = await attachHandoffContext({ organizationId: orgId, clientId, leadId: lead.id, agreedScope: full.serviceInterest, owner: "Delivery lead (pilot)", isDemo: true });
  const linked = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
  const replayed = await completeDealWonHandoff({ ...handoffInput(), deal: { ...handoffInput().deal, clientId: linked.clientId } });
  const ctx2 = await attachHandoffContext({ organizationId: orgId, clientId, leadId: lead.id, agreedScope: full.serviceInterest, isDemo: true });
  const [clientCount, onboarding, baselineTasks] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId, businessName: lead.businessName } }),
    prisma.onboardingItem.count({ where: { clientId } }),
    prisma.task.count({ where: { clientId, serviceType: "Onboarding" } }),
  ]);
  console.log(` 5. Closed Won → client ${clientId}, ${onboarding} onboarding items, baseline task ${ctx1.taskId}`);
  check("3 concurrent Closed Won events create exactly one client", racers.filter((r) => r.created).length === 1 && clientCount === 1);
  check("replay creates nothing new", !replayed.created && replayed.reason === "already-linked" && !ctx2.created && baselineTasks === 1);
  check("evidence and meeting summary carried into the baseline audit task", ctx1.evidenceCarried === 5 && ctx1.meetingCarried);

  // 6. Metrics, demo and live separately
  const [demo, live] = await Promise.all([salesMetrics(orgId, true), salesMetrics(orgId, false)]);
  console.log(" 6. Sales metrics   demo:", JSON.stringify(demo));
  console.log("                    live:", JSON.stringify(live));
  check("demo funnel is complete and live totals contain none of it", demo.confirmedSends === 3 && demo.positiveReplies === 1 && demo.confirmedMeetings === 1 && demo.attendedMeetings === 1 && demo.wins === 1 && demo.wonMonthlyRevenue === 1500 && live.wins === 0 && live.confirmedSends === 0);

  return { clientId };
}

async function clientOpsPilot(orgId: string, clientId: string) {
  console.log("\n=== CLIENT OPERATIONS PILOT (demo scope, staging fixture: broken lead route) ===");
  const say = (r: Awaited<ReturnType<typeof recordCheckResult>>, status: "ok" | "fail", detail: string) =>
    console.log(`      → ${describeOutcome({ status, detail, action: r.action, observedAt: r.observedAt, consecutiveFailures: r.consecutiveFailures, confirmAfter: r.confirmAfter })}`);
  const reload = (id: string) => prisma.monitor.findUniqueOrThrow({ where: { id } });

  const monitor = await prisma.monitor.create({
    data: {
      organizationId: orgId, isDemo: true, clientId, environment: "staging", confirmAfter: 2, owner: "Ops (pilot)",
      name: `${PILOT} Lead route — contact form`, type: MonitorType.LEAD_ROUTE, target: "https://staging.pcgutters.example/contact", cadenceMinutes: 15,
    },
  });
  console.log(` 1. Check ${monitor.id} (staging, confirms after 2 failures)`);
  console.log("    Hop trace: browser submit OK → server acknowledgement HTTP 500 (first failed hop) → test inbox: nothing received");
  const FAIL = "Form POST returned 500; lead not delivered to the test inbox";

  const f1 = await recordCheckResult(await reload(monitor.id), { status: "fail", detail: FAIL, statusCode: 500 }, { trigger: "simulated" });
  say(f1, "fail", FAIL);
  check("first failure is unconfirmed: no incident yet", f1.action === "failure_unconfirmed" && f1.incidentId === null);
  const f2 = await recordCheckResult(await reload(monitor.id), { status: "fail", detail: FAIL, statusCode: 500 }, { trigger: "simulated" });
  say(f2, "fail", FAIL);
  const incidentId = f2.incidentId!;
  const retry = await recordCheckResult(await reload(monitor.id), { status: "fail", detail: FAIL, statusCode: 500 }, { trigger: "retry" });
  say(retry, "fail", FAIL);
  const f3 = await recordCheckResult(await reload(monitor.id), { status: "fail", detail: FAIL, statusCode: 500 }, { trigger: "simulated" });
  say(f3, "fail", FAIL);

  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
  const [incidentCount, taskCount, alertRows] = await Promise.all([
    prisma.incident.count({ where: { monitorId: monitor.id } }),
    prisma.task.count({ where: { clientId, serviceType: "Monitoring" } }),
    prisma.notificationLog.findMany({ where: { organizationId: orgId, isDemo: true, event: "incident_opened", createdAt: { gte: f2.observedAt } } }),
  ]);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: incident.taskId! } });
  console.log(` 2. Incident ${incidentId} · task ${task.id} (owner ${task.owner}, priority ${task.priority})`);
  check("second failure opens the incident with one linked task", f2.action === "incident_opened" && !!incident.taskId);
  check("repeat trigger: no duplicate incident or task; retry not counted", incidentCount === 1 && taskCount === 1 && retry.action === "incident_retry" && f3.action === "incident_occurrence" && incident.occurrenceCount === 2);
  check("one alert event, kept inside the app (demo scope)", alertRows.length === 3 && alertRows.every((n) => n.status === "skipped"));
  const open = await getMonitoringSummary(orgId, true);
  console.log(`    Reconcile (demo): open incidents ${open.openIncidents} · active alerts ${open.activeAlerts} · incident tasks open ${open.openIncidentTasks}`);
  check("Monitoring, Client Health and Delivery agree while open (1 / 1 / 1)", open.openIncidents === 1 && open.activeAlerts === 1 && open.openIncidentTasks === 1);

  // 3. Scoped change proposal
  const scope = {
    site: "staging.pcgutters.example", environment: "staging", artifactVersion: "contact-form@1.4.2 → 1.4.3",
    expectedBehavior: "POST /contact returns 200 and the lead reaches the test inbox",
    testResults: "Before fix: POST /contact → 500 (2 confirmed failures)",
    rollbackPath: "Redeploy contact-form@1.4.2", filesInScope: ["api/contact.ts"],
  };
  const proposal = await proposeChange({ organizationId: orgId, incidentId, title: `${PILOT} Fix contact form lead route`, summary: "Mail handler rejects the form payload after a field rename.", scope, isDemo: true });
  console.log(` 3. Change proposal ${proposal.id} (valid until ${proposal.expiresAt?.toISOString()})`);

  // 4. Approval enforcement
  let healthy = false;
  const worker = async () => { healthy = true; return { ok: true, detail: "contact-form@1.4.3 deployed to staging" }; };
  const undo = async () => { healthy = false; return { ok: true, detail: "contact-form@1.4.2 redeployed to staging" }; };
  const pendingTry = await executeChange({ organizationId: orgId, approvalId: proposal.id, worker });
  check("execution is refused while the change is unapproved", !pendingTry.ok && pendingTry.reason === "pending" && !healthy, pendingTry.message);

  const rejected = await proposeChange({ organizationId: orgId, incidentId, title: `${PILOT} Rewrite the whole form (rejected)`, summary: "Out of scope.", scope, isDemo: true });
  await prisma.approvalRequest.update({ where: { id: rejected.id }, data: { status: ApprovalStatus.REJECTED, decidedAt: new Date(), outcome: "Rejected — nothing was sent or changed" } });
  const rejectedTry = await executeChange({ organizationId: orgId, approvalId: rejected.id, worker });
  check("a denied approval is enforced", !rejectedTry.ok && rejectedTry.reason === "rejected" && !healthy, rejectedTry.message);

  const stale = await proposeChange({ organizationId: orgId, incidentId, title: `${PILOT} Fix contact form (expired approval)`, summary: "Approved but not acted on in time.", scope, isDemo: true, ttlHours: 1, now: new Date(Date.now() - 5 * 3_600_000) });
  await prisma.approvalRequest.update({ where: { id: stale.id }, data: { status: ApprovalStatus.APPROVED, decidedAt: new Date(Date.now() - 4.5 * 3_600_000) } });
  const staleTry = await executeChange({ organizationId: orgId, approvalId: stale.id, worker });
  check("an expired approval is enforced", !staleTry.ok && staleTry.reason === "expired" && !healthy, staleTry.message);

  await prisma.approvalRequest.updateMany({ where: { id: proposal.id, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.APPROVED, decidedAt: new Date() } });
  const exec1 = await executeChange({ organizationId: orgId, approvalId: proposal.id, worker });
  const rb = await rollbackChange({ organizationId: orgId, approvalId: proposal.id, worker: undo });
  const afterRb = await recordCheckResult(await reload(monitor.id), { status: healthy ? "ok" : "fail", detail: FAIL, statusCode: 500 }, { trigger: "simulated" });
  check("valid approval executes; rollback in staging returns the failure without a new incident", exec1.ok && rb.ok && afterRb.action === "incident_occurrence" && (await prisma.incident.count({ where: { monitorId: monitor.id } })) === 1);
  const exec2 = await executeChange({ organizationId: orgId, approvalId: proposal.id, worker });
  console.log(` 4. ${exec2.message}`);
  const verified = await verifyChange({
    organizationId: orgId, approvalId: proposal.id,
    recheck: async () => {
      const r = await recordCheckResult(await reload(monitor.id), healthy ? { status: "ok", detail: "Form POST 200; lead delivered to the test inbox", statusCode: 200 } : { status: "fail", detail: FAIL }, { trigger: "simulated" });
      say(r, healthy ? "ok" : "fail", "Form POST 200; lead delivered to the test inbox");
      return { passed: r.action === "incident_resolved", detail: "original lead-route check passes" };
    },
  });
  const [resolved, alert, taskAfter, change] = await Promise.all([
    prisma.incident.findUniqueOrThrow({ where: { id: incidentId } }),
    prisma.founderAlert.findFirst({ where: { incidentId } }),
    prisma.task.findUniqueOrThrow({ where: { id: task.id } }),
    prisma.approvalRequest.findUniqueOrThrow({ where: { id: proposal.id } }),
  ]);
  check("staged fix verified by re-running the original check; incident recovered", verified.ok && resolved.status === "RESOLVED");
  check("execution, verification and closure are tracked separately", change.executionStatus === "executed" && change.verificationStatus === "passed" && taskAfter.status === TaskStatus.QA && !!alert?.resolvedAt);
  const recovered = await getMonitoringSummary(orgId, true);
  console.log(`    Reconcile (demo): open incidents ${recovered.openIncidents} · active alerts ${recovered.activeAlerts} (history ${recovered.historicalAlerts}) · incident tasks open ${recovered.openIncidentTasks} · recovered awaiting closure ${recovered.recoveredTasksAwaitingClosure}`);
  check("after recovery all three pages agree (0 / 0 / 0), task waits for closure", recovered.openIncidents === 0 && recovered.activeAlerts === 0 && recovered.openIncidentTasks === 0 && recovered.recoveredTasksAwaitingClosure === 1);

  // 5. Report from persisted evidence, gated
  const v1 = await buildIncidentReport({ organizationId: orgId, incidentId });
  if (!v1.ok) throw new Error(v1.reason);
  const early = await releaseReportToClient({ organizationId: orgId, reportId: v1.reportId });
  check("client-ready is refused while work is outstanding", !early.ok, early.ok ? "" : early.reason);
  await prisma.task.update({ where: { id: task.id }, data: { status: TaskStatus.Completed } });
  const v2 = await buildIncidentReport({ organizationId: orgId, incidentId });
  if (!v2.ok) throw new Error(v2.reason);
  const oldVersion = await releaseReportToClient({ organizationId: orgId, reportId: v1.reportId });
  const release = await releaseReportToClient({ organizationId: orgId, reportId: v2.reportId });
  const report = await prisma.report.findUniqueOrThrow({ where: { id: v2.reportId } });
  console.log(` 5. Report ${v2.reportId} v${v2.version}:\n${(report.reportSummary ?? "").split("\n").map((l) => "      " + l).join("\n")}`);
  check("an outdated report version cannot be released", !oldVersion.ok, oldVersion.ok ? "" : oldVersion.reason);
  check("latest version with approved + verified change is released", release.ok && report.version === 2);

  // 6. Deployment check: approved baseline vs staging manifest (fixture pages)
  const page = (h1: string, robots: string) =>
    `<html><head><title>Contact | PC Gutters</title><meta name="viewport" content="width=device-width"><meta name="robots" content="${robots}"><link rel="canonical" href="/contact"><script type="application/ld+json">{"@type":"LocalBusiness"}</script></head><body><h1>${h1}</h1><a href="tel:8505550101">Call</a><form action="/api/contact"></form></body></html>`;
  const baseline = extractManifest({ url: "https://pcgutters.example/contact", status: 200, finalUrl: "https://pcgutters.example/contact", html: page("Contact us", "index,follow") });
  const candidate = extractManifest({ url: "https://staging.pcgutters.example/contact", status: 200, finalUrl: "https://staging.pcgutters.example/contact", html: page("Contact us", "noindex") });
  const broken = extractManifest({ url: "https://staging.pcgutters.example/contact", status: 200, finalUrl: "https://staging.pcgutters.example/contact", html: page("Get in touch", "noindex").replace('action="/api/contact"', 'action="/api/old-contact"') });
  const good = compareManifests([{ path: "/contact", baseline, candidate }], ["Robots"]);
  const bad = compareManifests([{ path: "/contact", baseline, candidate: broken }], ["Robots"]);
  await prisma.releaseVerification.create({
    data: { organizationId: orgId, isDemo: true, site: "pcgutters.example", baselineUrl: "https://pcgutters.example", candidateUrl: "https://staging.pcgutters.example", expected: good.expected, checked: good.checked, failed: good.failed, skipped: good.skipped, results: good.items as unknown as object },
  });
  console.log(` 6. Deployment check: expected ${good.expected}, checked ${good.checked}, failed ${good.failed}, skipped ${good.skipped} (Robots declared as a staging difference)`);
  console.log(`    Broken candidate: failed ${bad.failed} → ${bad.items.filter((i) => i.result === "fail").map((i) => `${i.check}: expected "${i.expected}", got "${i.actual}"`).join("; ")}`);
  check("deployment check passes the good build and catches the regressions", good.failed === 0 && good.skipped === 1 && bad.failed === 2);
}

async function liveExclusion(orgId: string) {
  console.log("\n=== LIVE TOTALS EXCLUDE THE FIXTURE ===");
  const sum = async (isDemo: boolean) => {
    const rows = await prisma.client.findMany({ where: { organizationId: orgId, isDemo, status: { in: ["Active", "Onboarding", "AtRisk"] } }, select: { monthlyValue: true } });
    return rows.reduce((s, c) => s + Number(c.monthlyValue ?? 0), 0);
  };
  const [liveMrr, demoMrr, liveLeads, demoLeads, liveSummary] = await Promise.all([
    sum(false), sum(true),
    prisma.lead.count({ where: { organizationId: orgId, isDemo: false } }),
    prisma.lead.count({ where: { organizationId: orgId, isDemo: true } }),
    getMonitoringSummary(orgId, false),
  ]);
  console.log(`    Contracted MRR  live $${liveMrr}   demo $${demoMrr}`);
  console.log(`    Leads           live ${liveLeads}       demo ${demoLeads}`);
  console.log(`    Live monitoring: ${JSON.stringify({ checks: liveSummary.checks, openIncidents: liveSummary.openIncidents, activeAlerts: liveSummary.activeAlerts })}`);
  check("pilot $1,500 MRR is in the demo scope only", demoMrr === 1500 && liveMrr === 0);
  const [leakedIncidents, leakedAlerts, leakedTasks] = await Promise.all([
    prisma.incident.count({ where: { organizationId: orgId, isDemo: false, title: { contains: PILOT } } }),
    prisma.founderAlert.count({ where: { organizationId: orgId, isDemo: false, title: { contains: PILOT } } }),
    prisma.task.count({ where: { organizationId: orgId, isDemo: false, title: { contains: PILOT } } }),
  ]);
  check("no fixture incident, alert or task appears in the live scope", leakedIncidents + leakedAlerts + leakedTasks === 0);
}

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "valiant-firm" }, select: { id: true } });
  if (!org) throw new Error("Organization 'valiant-firm' not found — run db:seed first.");

  await cleanPilotData(org.id);
  if (process.argv.includes("--clean")) {
    console.log("Pilot fixture removed (audit history kept).");
    return;
  }

  const sales = await salesPilot(org.id);
  await clientOpsPilot(org.id, sales.clientId);
  await liveExclusion(org.id);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== PILOT RESULT: ${results.length - failed.length}/${results.length} checks passed ===`);
  failed.forEach((f) => console.log(`  FAILED: ${f.name}`));
  console.log("Fixture stays in the demo scope (switch to Demo in the top bar). Remove with: npm run pilots -- --clean\n");
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
