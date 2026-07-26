import { PageShell } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function SaaSRoadmapPage() {
  const { organizationId } = await requireSessionOrg();

  const products = await prisma.saasProduct.findMany({
    where: { organizationId },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  const variant = (status: string) => {
    if (status === "Live") return "success" as const;
    if (status === "Beta" || status === "MVP") return "info" as const;
    if (status === "Discovery") return "warning" as const;
    return "neutral" as const;
  };

  return (
    <PageShell title="SaaS Roadmap">
      <div className="grid gap-4 lg:grid-cols-2">
        {products.map((p) => (
          <div key={p.id} className="rounded-xl border border-card-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{p.productName}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                  For {p.targetUser}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge label={String(p.status)} variant={variant(String(p.status))} />
                <div className="text-[11px] text-muted">Priority {p.priority}</div>
              </div>
            </div>

            <div className="mt-4 text-sm text-muted">
              <div className="font-semibold text-foreground">Core features</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {(p.coreFeatures ?? []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-muted">
              <div>
                <span className="font-semibold text-foreground">MVP scope:</span> {p.mvpScope ?? "—"}
              </div>
              <div>
                <span className="font-semibold text-foreground">Pricing model:</span>{" "}
                {p.pricingModel ?? "—"}
              </div>
              <div>
                <span className="font-semibold text-foreground">Launch phase:</span>{" "}
                {p.launchPhase ?? "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
