import Link from "next/link";
import {
  ApprovalStatus,
  ClientStatus,
  LeadStatus,
  ReportStatus,
  TaskStatus,
} from "@prisma/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import {
  ChartCard,
  FunnelBarChart,
  HealthPieChart,
  MrrAreaChart,
  OutreachComboChart,
  ServiceRevenueBar,
  TasksCompletionChart,
} from "@/components/charts/dashboard-charts";
import { KpiCard, KpiCardAccent } from "@/components/dashboard/kpi-card";
import { ReconcileStrip } from "@/components/monitoring/reconcile-strip";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { formatCurrency } from "@/lib/utils";
import { money } from "@/lib/money";
import { getDataScope } from "@/lib/scope";
import { computeDashboardKpis, settle } from "@/lib/dashboard/kpis";
import { getMonitoringSummary } from "@/lib/monitoring/summary";
import { INTEGRATIONS, integrationState } from "@/lib/integrations/catalog";
import { netAfterTools, summarizeExpenses } from "@/lib/expenses";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const CONTRACTED_STATUSES = new Set<ClientStatus>([
  ClientStatus.Active,
  ClientStatus.Onboarding,
  ClientStatus.AtRisk,
]);

function sourceSegment(source: string | null): "inbound" | "referral" | "outbound" {
  const s = (source ?? "").toLowerCase();
  if (s.includes("inbound") || s.includes("web form")) return "inbound";
  if (s.includes("referral") || s.includes("partner")) return "referral";
  return "outbound";
}

export default async function DashboardPage() {
  const { organizationId, role } = await requireSessionOrg();
  const scope = getDataScope();
  const isDemo = scope.isDemo;
  const now = new Date();
  const scoped = { organizationId, isDemo };

  // Core records: if these fail the route error boundary handles it.
  const [clients, leads, deals, tasks] = await Promise.all([
    prisma.client.findMany({ where: scoped }),
    prisma.lead.findMany({ where: scoped }),
    prisma.deal.findMany({ where: scoped }),
    prisma.task.findMany({ where: scoped, select: { status: true } }),
  ]);

  // Secondary sources degrade to "Unavailable" instead of failing the page.
  const [invoices, reportsDue, automationFailures, aiSpendAgg, rrAgg, monitoring, reviews, meetings, demoCounts] =
    await Promise.all([
      settle(
        prisma.invoice.findMany({
          where: { organizationId, ...(isDemo ? { client: { isDemo: true } } : { OR: [{ clientId: null }, { client: { isDemo: false } }] }) },
          select: { status: true, totalCents: true, issuedAt: true, paidAt: true },
        }),
      ),
      settle(
        prisma.report.count({
          where: { ...scoped, status: { in: [ReportStatus.Draft, ReportStatus.QA] } },
        }),
      ),
      settle(
        prisma.automationLog.count({
          where: { organizationId, OR: [{ status: "degraded" }, { failureCount: { gt: 5 } }] },
        }),
      ),
      settle(
        prisma.aiLog.aggregate({
          where: { organizationId, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
          _sum: { costEstimate: true },
        }),
      ),
      settle(prisma.rankRentAsset.aggregate({ where: { organizationId }, _sum: { monthlyRevenue: true } })),
      settle(getMonitoringSummary(organizationId, isDemo, now)),
      settle(prisma.approvalRequest.count({ where: { ...scoped, status: ApprovalStatus.PENDING } })),
      settle(
        prisma.meeting.count({
          where: { ...scoped, status: { in: ["confirmed", "rescheduled"] }, startsAt: { gte: now } },
        }),
      ),
      settle(
        Promise.all([
          prisma.client.count({ where: { organizationId, isDemo: true } }),
          prisma.lead.count({ where: { organizationId, isDemo: true } }),
        ]),
      ),
    ]);

  const kpis = computeDashboardKpis({
    clients: clients.map((c) => ({ status: c.status, monthlyValue: money(c.monthlyValue), createdAt: c.createdAt })),
    leads,
    deals,
    invoices: invoices ?? [],
    now,
  });

  // Tool costs are finance data: only roles allowed to read expenses see them.
  const showCosts = can(role, "expense.read");
  const expenseRows = showCosts
    ? await settle(prisma.expense.findMany({ where: scoped }))
    : null;
  const costs = expenseRows ? summarizeExpenses(expenseRows) : null;
  const net = costs ? netAfterTools(kpis.contractedMrr, costs) : null;

  const openTasks = tasks.filter((t) => t.status !== TaskStatus.Completed).length;
  const connectedTools = INTEGRATIONS.filter((t) => integrationState(t) === "connected").length;
  const unavailable = "Unavailable";
  const demoRecords = demoCounts ? demoCounts[0] + demoCounts[1] : 0;

  const attention: { label: string; value: string; hint: string; href: string }[] = [
    {
      label: "Open incidents",
      value: monitoring ? String(monitoring.openIncidents) : unavailable,
      hint: "Website issues open right now",
      href: "/monitoring",
    },
    { label: "Unresolved tasks", value: String(openTasks), hint: "Delivery tasks not completed", href: "/delivery" },
    {
      label: "Waiting for review",
      value: reviews === null ? unavailable : String(reviews),
      hint: "Emails and changes needing approval",
      href: "/approvals",
    },
    {
      label: "Upcoming meetings",
      value: meetings === null ? unavailable : String(meetings),
      hint: "Confirmed by the calendar source",
      href: "/outreach",
    },
    {
      label: "Provider connections",
      value: `${connectedTools}/${INTEGRATIONS.length}`,
      hint: "Tools connected; open to test or sync",
      href: "/integrations",
    },
    {
      label: "Failed automations",
      value: automationFailures === null ? unavailable : String(automationFailures),
      hint: "Workflows degraded or failing",
      href: "/automations",
    },
  ];

  const funnelCounts = [
    LeadStatus.Raw,
    LeadStatus.Qualified,
    LeadStatus.OutreachQueue,
    LeadStatus.InSequence,
    LeadStatus.Replied,
    LeadStatus.CallBooked,
    LeadStatus.ProposalSent,
    LeadStatus.ClosedWon,
  ].map((status) => ({ stage: status, count: leads.filter((l) => l.status === status).length }));

  const scored = clients.filter((c) => c.healthScore !== null);
  const healthBuckets = [
    { name: "Green (80+)", value: scored.filter((c) => c.healthScore! >= 80).length },
    { name: "Yellow (60–79)", value: scored.filter((c) => c.healthScore! >= 60 && c.healthScore! < 80).length },
    { name: "Orange (40–59)", value: scored.filter((c) => c.healthScore! >= 40 && c.healthScore! < 60).length },
    { name: "Red (<40)", value: scored.filter((c) => c.healthScore! < 40).length },
  ];

  const outreachBars = (
    [
      ["inbound", "Inbound / forms"],
      ["referral", "Referrals / partners"],
      ["outbound", "Outbound / other"],
    ] as const
  ).map(([key, label]) => {
    const segment = leads.filter((l) => sourceSegment(l.source) === key);
    return {
      label,
      sent: segment.filter((l) => l.sequenceStartedAt != null || l.status === LeadStatus.InSequence).length,
      replies: segment.filter((l) => l.manualReplied).length,
      booked: segment.filter((l) => l.manualBooked || l.status === LeadStatus.CallBooked).length,
    };
  });

  // Contracted MRR by month-end, from the same scoped client records.
  const mrrSeries = Array.from({ length: 6 }, (_, i) => {
    const monthStart = startOfMonth(subMonths(now, 5 - i));
    const end = endOfMonth(monthStart);
    const mrr = clients
      .filter(
        (c) =>
          (CONTRACTED_STATUSES.has(c.status) || c.status === ClientStatus.Paused) &&
          (c.contractStart ?? c.createdAt) <= end,
      )
      .reduce((s, c) => s + money(c.monthlyValue), 0);
    return { month: format(monthStart, "MMM"), mrr: Math.round(mrr) };
  });

  const taskAgg = Object.values(TaskStatus).map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }));

  const revenueByServiceMap = new Map<string, number>();
  for (const c of clients.filter((x) => CONTRACTED_STATUSES.has(x.status))) {
    const key = c.servicePurchased ?? "Unspecified";
    revenueByServiceMap.set(key, (revenueByServiceMap.get(key) ?? 0) + money(c.monthlyValue));
  }
  const revenueByService = Array.from(revenueByServiceMap.entries()).map(([service, amount]) => ({
    service,
    amount: Math.round(amount),
  }));

  const noRecords = clients.length === 0 && leads.length === 0 && deals.length === 0;

  return (
    <PageShell title="Founder Dashboard">
      {isDemo ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          You are viewing <span className="font-semibold">demo data</span> (pilot fixtures). None of
          these figures are part of live totals. Switch to Live in the top bar to see real operations.
        </div>
      ) : demoRecords > 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-3 text-xs text-muted">
          Live data only. {demoRecords} pilot fixture record{demoRecords === 1 ? " is" : "s are"} kept in
          the demo scope and excluded from every total here.
        </div>
      ) : null}

      {noRecords ? (
        <div className="rounded-xl border border-card-border bg-card p-4 text-sm">
          <div className="font-semibold">No {isDemo ? "demo" : "live"} records yet</div>
          <p className="mt-1 text-muted">
            Totals below are zero because nothing has been recorded in this scope.{" "}
            <Link className="text-valiant hover:underline" href="/leads">
              Add a lead
            </Link>
            ,{" "}
            <Link className="text-valiant hover:underline" href="/clients">
              add a client
            </Link>{" "}
            or{" "}
            <Link className="text-valiant hover:underline" href="/monitoring">
              add a website to monitor
            </Link>
            .
          </p>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Needs attention</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {attention.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="rounded-xl border border-card-border bg-card p-3 shadow-sm transition-colors hover:border-valiant/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-valiant/50"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{a.label}</div>
              <div className="mt-1 text-xl font-semibold">{a.value}</div>
              <div className="mt-0.5 text-[11px] text-muted">{a.hint}</div>
            </Link>
          ))}
        </div>
      </section>

      {monitoring ? (
        <ReconcileStrip summary={monitoring} />
      ) : (
        <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
          Monitoring status is unavailable right now.{" "}
          <Link className="text-valiant hover:underline" href="/monitoring">
            Open Monitoring
          </Link>{" "}
          to retry.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCardAccent label="Contracted MRR" value={formatCurrency(kpis.contractedMrr)} />
        <KpiCard
          label="Invoiced (30d)"
          value={invoices === null ? unavailable : formatCurrency(kpis.invoiced30d)}
          hint="Invoices issued, excluding drafts and voids."
        />
        <KpiCard
          label="Collected (30d)"
          value={invoices === null ? unavailable : formatCurrency(kpis.collected30d)}
          hint="Invoices marked paid."
        />
        {showCosts ? (
          <>
            <KpiCard
              label="Tool costs / month"
              value={costs ? formatCurrency(costs.actualMonthlyCents / 100) : unavailable}
              hint={
                costs
                  ? costs.withoutAmount
                    ? `${costs.withAmount} priced; ${costs.withoutAmount} active tool(s) have no amount yet`
                    : `${costs.withAmount} active tool(s) priced`
                  : undefined
              }
            />
            <KpiCard
              label={net && net.incomplete ? "Net after tools (incomplete)" : "Net after tools / month"}
              value={net ? formatCurrency(net.netMonthly) : unavailable}
              hint="Contracted MRR minus entered tool costs."
            />
          </>
        ) : null}
        <KpiCard label="New contracted MRR (30d)" value={formatCurrency(kpis.newMrr30d)} hint="Clients added in the last 30 days." />
        <KpiCard label="Active clients" value={String(kpis.activeClients)} hint={`${kpis.onboardingClients} onboarding`} />
        <KpiCard label="At-risk clients" value={String(kpis.atRiskClients)} />
        <KpiCard label="Churned MRR" value={formatCurrency(kpis.churnedMrr)} hint="Monthly value of churned clients." />
        <KpiCard label="Closed-won deals" value={String(kpis.closedWonDeals)} />
        <KpiCard label="Qualified leads" value={String(kpis.qualifiedLeads)} />
        <KpiCard label="Outreach started" value={String(kpis.outreachSent)} />
        <KpiCard label="Replies recorded" value={String(kpis.positiveReplies)} />
        <KpiCard label="Calls booked" value={String(kpis.callsBooked)} />
        <KpiCard label="Proposals sent" value={String(kpis.proposalsSent)} />
        <KpiCard label="Reports in draft or QA" value={reportsDue === null ? unavailable : String(reportsDue)} />
        <KpiCard
          label="AI spend (30d)"
          value={aiSpendAgg === null ? unavailable : formatCurrency(money(aiSpendAgg._sum.costEstimate))}
        />
        <KpiCard
          label="Rank-and-rent revenue"
          value={rrAgg === null ? unavailable : formatCurrency(money(rrAgg._sum.monthlyRevenue))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Contracted MRR by month-end">
          <MrrAreaChart data={mrrSeries} />
        </ChartCard>
        <ChartCard title="Lead pipeline funnel">
          <FunnelBarChart data={funnelCounts} />
        </ChartCard>
        <ChartCard title="Client health distribution (scored clients)">
          <HealthPieChart data={healthBuckets.filter((h) => h.value > 0)} />
        </ChartCard>
        <ChartCard title="Outreach signals by lead source">
          <OutreachComboChart data={outreachBars} />
        </ChartCard>
        <ChartCard title="Delivery task completion">
          <TasksCompletionChart data={taskAgg} />
        </ChartCard>
        <ChartCard title="Contracted revenue by service">
          <ServiceRevenueBar data={revenueByService} />
        </ChartCard>
      </div>
    </PageShell>
  );
}
