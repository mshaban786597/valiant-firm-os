import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { ClientDetailCrud } from "@/components/clients/client-detail-crud";
import { OnboardingChecklist } from "@/components/clients/onboarding-checklist";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/utils";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organizationId } = await requireSessionOrg();

  const client = await prisma.client.findFirst({
    where: { id: params.id, organizationId },
    include: {
      onboardingItems: { orderBy: { sortOrder: "asc" } },
      tasks: { orderBy: { dueDate: "asc" }, take: 40 },
      reports: { orderBy: { month: "desc" }, take: 6 },
    },
  });

  if (!client) notFound();

  const checklistItems = client.onboardingItems.map((i) => ({
    id: i.id,
    label: i.label,
    completed: i.completed,
  }));

  return (
    <PageShell title={client.businessName}>
      <div className="text-sm text-muted">
        <Link href="/clients" className="text-valiant hover:underline">
          ← Clients
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-card-border bg-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Account snapshot
              </div>
              <div className="mt-2 text-sm text-muted">{client.primaryContact ?? "—"}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ClientDetailCrud client={client} />
              <ScoreBadge score={client.healthScore} />
              <StatusBadge label={client.status} variant="info" />
            </div>
          </div>

          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">MRR</dt>
              <dd className="font-semibold">{formatCurrency(money(client.monthlyValue))}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">Website</dt>
              <dd className="font-medium">{client.websiteUrl ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-card-border py-2">
              <dt className="text-muted">Targets</dt>
              <dd className="text-right font-medium">
                {(client.targetServices ?? []).join(", ") || "—"}
                <div className="text-xs text-muted">
                  {(client.targetLocations ?? []).join(", ") || ""}
                </div>
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted">Integrations</dt>
              <dd className="text-right text-xs text-muted">
                GA4 {client.ga4PropertyId ?? "—"} · GSC {client.gscSiteUrl ?? "—"} · GBP{" "}
                {client.gbpLocationId ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <OnboardingChecklist items={checklistItems} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Delivery tasks
          </div>
          <div className="mt-3 space-y-2">
            {client.tasks.map((t) => (
              <div key={t.id} className="rounded-lg border border-card-border bg-background/40 p-3 text-xs">
                <div className="font-semibold">{t.title}</div>
                <div className="mt-1 text-muted">
                  {t.status} · {t.priority}
                  {t.dueDate ? ` · due ${t.dueDate.toLocaleDateString()}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Recent reports
          </div>
          <div className="mt-3 space-y-2">
            {client.reports.map((r) => (
              <div key={r.id} className="rounded-lg border border-card-border bg-background/40 p-3 text-xs">
                <div className="flex justify-between gap-3 font-semibold">
                  <span>{r.month}</span>
                  <span className="text-muted">{r.status}</span>
                </div>
                <div className="mt-2 text-muted">
                  Sessions {r.organicSessions ?? "—"} · Leads {r.organicLeads ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
