import {
  ClientStatus,
  DealStage,
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
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { formatCurrency } from "@/lib/utils";
import { money } from "@/lib/money";

const CONTRACTED_STATUSES = new Set<ClientStatus>([
  ClientStatus.Active,
  ClientStatus.Onboarding,
  ClientStatus.AtRisk,
]);

const QUALIFIED_PIPELINE_STATUSES = new Set<LeadStatus>([
  LeadStatus.Qualified,
  LeadStatus.OutreachQueue,
  LeadStatus.InSequence,
]);

export default async function DashboardPage() {
  const { organizationId } = await requireSessionOrg();

  const [
    clients,
    leads,
    deals,
    tasks,
    reportsDue,
    automationFailures,
    aiSpendAgg,
    rrAgg,
    dealsClosed,
    recentClients,
  ] = await Promise.all([
    prisma.client.findMany({ where: { organizationId } }),
    prisma.lead.findMany({ where: { organizationId } }),
    prisma.deal.findMany({ where: { organizationId } }),
    prisma.task.findMany({ where: { organizationId } }),
    prisma.report.count({
      where: {
        organizationId,
        status: { in: [ReportStatus.Draft, ReportStatus.QA] },
      },
    }),
    prisma.automationLog.count({
      where: {
        organizationId,
        OR: [{ status: "degraded" }, { failureCount: { gt: 5 } }],
      },
    }),
    prisma.aiLog.aggregate({
      where: {
        organizationId,
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      _sum: { costEstimate: true },
    }),
    prisma.rankRentAsset.aggregate({
      where: { organizationId },
      _sum: { monthlyRevenue: true },
    }),
    prisma.deal.count({
      where: { organizationId, stage: DealStage.ClosedWon },
    }),
    prisma.client.findMany({
      where: {
        organizationId,
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      select: { monthlyValue: true },
    }),
  ]);

  const activeMrr = clients
    .filter((c) => CONTRACTED_STATUSES.has(c.status))
    .reduce((s, c) => s + money(c.monthlyValue), 0);

  const churnedMrr = clients
    .filter((c) => c.status === ClientStatus.Churned)
    .reduce((s, c) => s + money(c.monthlyValue), 0);

  const newMrr30 = recentClients.reduce((s, c) => s + money(c.monthlyValue), 0);

  const netMrrChange = newMrr30 - churnedMrr * 0.25;

  const atRiskClients = clients.filter((c) => c.status === ClientStatus.AtRisk).length;

  const qualifiedLeads = leads.filter(
    (l) =>
      (l.leadScore ?? 0) >= 65 || QUALIFIED_PIPELINE_STATUSES.has(l.status),
  ).length;

  const outreachSent = leads.filter(
    (l) => l.sequenceStartedAt || l.status === LeadStatus.InSequence,
  ).length;

  const positiveReplies = leads.filter((l) => l.manualReplied).length;

  const callsBooked = leads.filter(
    (l) => l.manualBooked || l.status === LeadStatus.CallBooked,
  ).length;

  const proposalsSent =
    deals.filter((d) => d.stage === DealStage.ProposalSent).length +
    leads.filter((l) => l.status === LeadStatus.ProposalSent).length;

  const aiSpend = money(aiSpendAgg._sum.costEstimate);
  const rrRevenue = money(rrAgg._sum.monthlyRevenue);

  const funnelCounts = [
    LeadStatus.Raw,
    LeadStatus.Qualified,
    LeadStatus.OutreachQueue,
    LeadStatus.InSequence,
    LeadStatus.Replied,
    LeadStatus.CallBooked,
    LeadStatus.ProposalSent,
    LeadStatus.ClosedWon,
  ].map((status) => ({
    stage: status,
    count: leads.filter((l) => l.status === status).length,
  }));

  const healthBuckets = [
    {
      name: "Green (80+)",
      value: clients.filter((c) => (c.healthScore ?? 0) >= 80).length,
    },
    {
      name: "Yellow (60–79)",
      value: clients.filter(
        (c) => (c.healthScore ?? 0) >= 60 && (c.healthScore ?? 0) < 80,
      ).length,
    },
    {
      name: "Orange (40–59)",
      value: clients.filter(
        (c) => (c.healthScore ?? 0) >= 40 && (c.healthScore ?? 0) < 60,
      ).length,
    },
    {
      name: "Red (<40)",
      value: clients.filter((c) => (c.healthScore ?? 0) < 40).length,
    },
  ];

  const outreachBars = [
    {
      label: "Inbound / forms",
      ...(() => {
        const segment = leads.filter((l) => {
          const s = (l.source ?? "").toLowerCase();
          return s.includes("inbound") || s.includes("web form");
        });
        return {
          sent: segment.filter(
            (l) => l.sequenceStartedAt != null || l.status === LeadStatus.InSequence,
          ).length,
          replies: segment.filter((l) => l.manualReplied).length,
          booked: segment.filter(
            (l) => l.manualBooked || l.status === LeadStatus.CallBooked,
          ).length,
        };
      })(),
    },
    {
      label: "Referrals / partners",
      ...(() => {
        const segment = leads.filter((l) => {
          const s = (l.source ?? "").toLowerCase();
          return s.includes("referral") || s.includes("partner");
        });
        return {
          sent: segment.filter(
            (l) => l.sequenceStartedAt != null || l.status === LeadStatus.InSequence,
          ).length,
          replies: segment.filter((l) => l.manualReplied).length,
          booked: segment.filter(
            (l) => l.manualBooked || l.status === LeadStatus.CallBooked,
          ).length,
        };
      })(),
    },
    {
      label: "Outbound / other",
      ...(() => {
        const segment = leads.filter((l) => {
          const s = (l.source ?? "").toLowerCase();
          if (!s) return true;
          return (
            !s.includes("inbound") &&
            !s.includes("web form") &&
            !s.includes("referral") &&
            !s.includes("partner")
          );
        });
        return {
          sent: segment.filter(
            (l) => l.sequenceStartedAt != null || l.status === LeadStatus.InSequence,
          ).length,
          replies: segment.filter((l) => l.manualReplied).length,
          booked: segment.filter(
            (l) => l.manualBooked || l.status === LeadStatus.CallBooked,
          ).length,
        };
      })(),
    },
  ];

  const mrrSeries = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const monthStart = startOfMonth(subMonths(new Date(), 5 - i));
      const end = endOfMonth(monthStart);
      const rows = await prisma.client.findMany({
        where: {
          organizationId,
          status: {
            in: [
              ClientStatus.Active,
              ClientStatus.Onboarding,
              ClientStatus.AtRisk,
              ClientStatus.Paused,
            ],
          },
          OR: [{ contractStart: null }, { contractStart: { lte: end } }],
        },
        select: { monthlyValue: true },
      });
      const mrr = rows.reduce((s, c) => s + money(c.monthlyValue), 0);
      return { month: format(monthStart, "MMM"), mrr: Math.round(mrr) };
    }),
  );

  const taskAgg = Object.values(TaskStatus).map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }));

  const revenueByServiceMap = new Map<string, number>();
  for (const c of clients.filter((x) => CONTRACTED_STATUSES.has(x.status))) {
    const key = c.servicePurchased ?? "Unspecified";
    revenueByServiceMap.set(key, (revenueByServiceMap.get(key) ?? 0) + money(c.monthlyValue));
  }
  const revenueByService = Array.from(revenueByServiceMap.entries()).map(
    ([service, amount]) => ({ service, amount: Math.round(amount) }),
  );

  return (
    <PageShell title="Founder Dashboard">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCardAccent label="Monthly Recurring Revenue" value={formatCurrency(activeMrr)} />
        <KpiCard label="New MRR (30d)" value={formatCurrency(newMrr30)} hint="From recent client adds." />
        <KpiCard label="Churned MRR exposure" value={formatCurrency(churnedMrr)} />
        <KpiCard
          label="Net MRR change"
          value={formatCurrency(netMrrChange)}
          trend={netMrrChange >= 0 ? "Healthy trajectory" : "Watch churn"}
        />
        <KpiCard label="Active clients" value={String(clients.filter((c) => c.status === ClientStatus.Active).length)} />
        <KpiCard label="At-risk clients" value={String(atRiskClients)} />
        <KpiCard label="Qualified leads" value={String(qualifiedLeads)} />
        <KpiCard label="Outreach sent" value={String(outreachSent)} />
        <KpiCard label="Positive replies" value={String(positiveReplies)} />
        <KpiCard label="Calls booked" value={String(callsBooked)} />
        <KpiCard label="Proposals sent" value={String(proposalsSent)} />
        <KpiCard label="Closed deals" value={String(dealsClosed)} />
        <KpiCard label="Monthly reports due" value={String(reportsDue)} />
        <KpiCard label="Failed / degraded automations" value={String(automationFailures)} />
        <KpiCard label="AI spend (30d)" value={formatCurrency(aiSpend)} />
        <KpiCard label="Rank-and-rent revenue" value={formatCurrency(rrRevenue)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="MRR snapshot by month-end (contracted clients)">
          <MrrAreaChart data={mrrSeries} />
        </ChartCard>
        <ChartCard title="Lead pipeline funnel">
          <FunnelBarChart data={funnelCounts} />
        </ChartCard>
        <ChartCard title="Client health distribution">
          <HealthPieChart data={healthBuckets.filter((h) => h.value > 0)} />
        </ChartCard>
        <ChartCard title="Outreach signals by lead source (database)">
          <OutreachComboChart data={outreachBars} />
        </ChartCard>
        <ChartCard title="Delivery task completion">
          <TasksCompletionChart data={taskAgg} />
        </ChartCard>
        <ChartCard title="Revenue by service type">
          <ServiceRevenueBar data={revenueByService} />
        </ChartCard>
      </div>
    </PageShell>
  );
}
