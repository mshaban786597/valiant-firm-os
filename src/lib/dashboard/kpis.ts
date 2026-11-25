/**
 * Pure Founder Dashboard KPI math. Every figure is derived from the records
 * passed in (already filtered to one tenant and one data scope) — nothing is
 * estimated or weighted. Works on empty input.
 *
 * Revenue is reported as three separate, source-defined metrics:
 *  - contractedMrr  monthly value of clients in a contracted status (client records)
 *  - invoiced30d    total of invoices issued in the last 30 days, excluding drafts and voids
 *  - collected30d   total of invoices paid in the last 30 days
 */
export interface KpiClient {
  status: string;
  monthlyValue: number;
  createdAt: Date;
}
export interface KpiLead {
  status: string;
  leadScore: number | null;
  sequenceStartedAt: Date | null;
  manualReplied: boolean;
  manualBooked: boolean;
}
export interface KpiDeal {
  stage: string;
}
export interface KpiInvoice {
  status: string;
  totalCents: number;
  issuedAt: Date | null;
  paidAt: Date | null;
}

const CONTRACTED = ["Active", "Onboarding", "AtRisk"];
const QUALIFIED_STATUSES = ["Qualified", "OutreachQueue", "InSequence"];

export interface DashboardKpis {
  contractedMrr: number;
  newMrr30d: number;
  churnedMrr: number;
  invoiced30d: number;
  collected30d: number;
  activeClients: number;
  onboardingClients: number;
  atRiskClients: number;
  qualifiedLeads: number;
  outreachSent: number;
  positiveReplies: number;
  callsBooked: number;
  proposalsSent: number;
  closedWonDeals: number;
}

export function computeDashboardKpis(input: {
  clients: KpiClient[];
  leads: KpiLead[];
  deals: KpiDeal[];
  invoices: KpiInvoice[];
  now?: Date;
}): DashboardKpis {
  const now = input.now ?? new Date();
  const since = now.getTime() - 30 * 86_400_000;
  const within30 = (d: Date | null) => !!d && d.getTime() >= since && d.getTime() <= now.getTime();
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const contracted = input.clients.filter((c) => CONTRACTED.indexOf(c.status) !== -1);

  return {
    contractedMrr: sum(contracted.map((c) => c.monthlyValue)),
    newMrr30d: sum(contracted.filter((c) => within30(c.createdAt)).map((c) => c.monthlyValue)),
    churnedMrr: sum(input.clients.filter((c) => c.status === "Churned").map((c) => c.monthlyValue)),
    invoiced30d:
      sum(
        input.invoices
          .filter((i) => (i.status === "Open" || i.status === "Paid") && within30(i.issuedAt))
          .map((i) => i.totalCents),
      ) / 100,
    collected30d:
      sum(input.invoices.filter((i) => i.status === "Paid" && within30(i.paidAt)).map((i) => i.totalCents)) / 100,
    activeClients: input.clients.filter((c) => c.status === "Active").length,
    onboardingClients: input.clients.filter((c) => c.status === "Onboarding").length,
    atRiskClients: input.clients.filter((c) => c.status === "AtRisk").length,
    qualifiedLeads: input.leads.filter(
      (l) => (l.leadScore ?? 0) >= 65 || QUALIFIED_STATUSES.indexOf(l.status) !== -1,
    ).length,
    outreachSent: input.leads.filter((l) => l.sequenceStartedAt || l.status === "InSequence").length,
    positiveReplies: input.leads.filter((l) => l.manualReplied).length,
    callsBooked: input.leads.filter((l) => l.manualBooked || l.status === "CallBooked").length,
    proposalsSent:
      input.deals.filter((d) => d.stage === "ProposalSent").length +
      input.leads.filter((l) => l.status === "ProposalSent").length,
    closedWonDeals: input.deals.filter((d) => d.stage === "ClosedWon").length,
  };
}

/** Settle a secondary query: a failure becomes `null` ("unavailable") instead of crashing the page. */
export async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
