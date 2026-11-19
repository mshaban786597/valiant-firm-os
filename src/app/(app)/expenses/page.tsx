import { ClientStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard, KpiCardAccent } from "@/components/dashboard/kpi-card";
import { ExpensesWorkspace, type ExpenseRow } from "@/components/expenses/expenses-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";
import { money } from "@/lib/money";
import { formatCurrency } from "@/lib/utils";
import { monthlyCostCents, netAfterTools, summarizeExpenses } from "@/lib/expenses";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const { organizationId } = await requireSessionOrg();
  const scope = getDataScope();
  const scoped = { organizationId, isDemo: scope.isDemo };

  const [expenses, clients] = await Promise.all([
    prisma.expense.findMany({ where: scoped, orderBy: [{ status: "asc" }, { name: "asc" }], take: 500 }),
    prisma.client.findMany({
      where: { ...scoped, status: { in: [ClientStatus.Active, ClientStatus.Onboarding, ClientStatus.AtRisk] } },
      select: { monthlyValue: true },
    }),
  ]);

  const contractedMrr = clients.reduce((s, c) => s + money(c.monthlyValue), 0);
  const summary = summarizeExpenses(expenses);
  const net = netAfterTools(contractedMrr, summary);

  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    name: e.name,
    vendor: e.vendor,
    category: e.category,
    billingCycle: e.billingCycle,
    amountCents: e.amountCents,
    monthlyCents: e.billingCycle === "one_time" ? null : monthlyCostCents(e),
    plannedLowCents: e.plannedLowCents,
    plannedHighCents: e.plannedHighCents,
    status: e.status,
    notes: e.notes,
  }));

  const hasPlan = summary.plannedHighCents > 0;

  return (
    <PageShell title="Tool Expenses">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Contracted MRR"
          value={formatCurrency(contractedMrr)}
          hint={`${clients.length} contracted client${clients.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Tool costs / month (entered)"
          value={formatCurrency(summary.actualMonthlyCents / 100)}
          hint={
            summary.withoutAmount
              ? `${summary.withAmount} tool(s) priced; ${summary.withoutAmount} active with no amount yet`
              : `${summary.withAmount} active tool(s) priced`
          }
        />
        <KpiCardAccent
          label={net.incomplete ? "Net after tools (incomplete)" : "Net after tools / month"}
          value={formatCurrency(net.netMonthly)}
        />
        <KpiCard
          label="Planned range / month"
          value={
            hasPlan
              ? `${formatCurrency(summary.plannedLowCents / 100)} – ${formatCurrency(summary.plannedHighCents / 100)}`
              : "No plan entered"
          }
          hint={
            hasPlan
              ? `Net at plan: ${formatCurrency(net.netAtPlannedHigh)} – ${formatCurrency(net.netAtPlannedLow)}`
              : undefined
          }
        />
      </div>

      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Showing {scope.label.toLowerCase()}. The monthly total counts only amounts you have entered.
        Planned ranges are budget estimates and are never added to the actual total.
        {summary.withoutAmount
          ? ` ${summary.withoutAmount} active tool(s) still need their real amount, so the real net is lower than shown.`
          : ""}
      </div>

      <ExpensesWorkspace expenses={rows} />
    </PageShell>
  );
}
