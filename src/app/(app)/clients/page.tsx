import Link from "next/link";
import { ClientStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { ClientsToolbar } from "@/components/clients/client-form-modal";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function ClientsPage() {
  const { organizationId } = await requireSessionOrg();

  const clients = await prisma.client.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    take: 250,
  });

  const variantForStatus = (status: ClientStatus) => {
    if (status === ClientStatus.Active) return "success" as const;
    if (status === ClientStatus.AtRisk) return "danger" as const;
    if (status === ClientStatus.Onboarding) return "warning" as const;
    if (status === ClientStatus.Churned) return "neutral" as const;
    return "info" as const;
  };

  return (
    <PageShell title="Client Management" actions={<ClientsToolbar />}>
      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Close a deal as Won to auto-create a client, or add one manually."
        />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">MRR</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-semibold hover:text-valiant">
                    {c.businessName}
                  </Link>
                  <div className="text-xs text-muted">{c.primaryContact ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-muted">{c.servicePurchased ?? "—"}</td>
                <td className="px-4 py-3 font-medium">{formatCurrency(money(c.monthlyValue))}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={c.healthScore} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={c.status} variant={variantForStatus(c.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </PageShell>
  );
}
