import Link from "next/link";
import { LeadStatus } from "@prisma/client";
import { PageShell } from "@/components/layout/page-shell";
import { LeadsToolbar } from "@/components/leads/lead-form-modal";
import { LeadsImportExport } from "@/components/leads/leads-import-export";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organizationId } = await requireSessionOrg();

  const q = searchParams?.q?.trim();
  const niche = searchParams?.niche?.trim();
  const city = searchParams?.city?.trim();
  const status = searchParams?.status as LeadStatus | undefined;
  const minScoreRaw = searchParams?.minScore;
  const minScore = minScoreRaw ? Number(minScoreRaw) : undefined;

  const filters = [];
  if (q) {
    filters.push({
      OR: [
        { businessName: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  if (niche) filters.push({ niche: { equals: niche, mode: "insensitive" as const } });
  if (city) filters.push({ city: { equals: city, mode: "insensitive" as const } });
  if (status) filters.push({ status });
  if (minScore !== undefined && !Number.isNaN(minScore)) {
    filters.push({ leadScore: { gte: minScore } });
  }

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      ...(filters.length ? { AND: filters } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const niches = await prisma.lead.groupBy({
    by: ["niche"],
    where: { organizationId },
  });

  const won = new Set<LeadStatus>([LeadStatus.ClosedWon]);
  const closed = new Set<LeadStatus>([LeadStatus.ClosedLost, LeadStatus.Archived]);
  const engaged = new Set<LeadStatus>([LeadStatus.Replied, LeadStatus.CallBooked]);

  const stageVariant = (status: LeadStatus) => {
    if (won.has(status)) return "success" as const;
    if (closed.has(status)) return "neutral" as const;
    if (engaged.has(status)) return "info" as const;
    return "warning" as const;
  };

  return (
    <PageShell
      title="Lead Database"
      actions={
        <div className="flex items-center gap-2">
          <LeadsImportExport />
          <LeadsToolbar />
        </div>
      }
    >
      <form className="rounded-xl border border-card-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search business / email"
            className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2 md:col-span-2"
          />
          <select
            name="niche"
            defaultValue={niche ?? ""}
            className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2"
          >
            <option value="">All niches</option>
            {niches.map((n) => (
              <option key={n.niche} value={n.niche}>
                {n.niche}
              </option>
            ))}
          </select>
          <input
            name="city"
            defaultValue={city ?? ""}
            placeholder="City"
            className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2"
          />
          <input
            name="minScore"
            defaultValue={minScoreRaw ?? ""}
            placeholder="Min score"
            className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2 md:col-span-2"
          >
            <option value="">All statuses</option>
            {Object.values(LeadStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-valiant px-4 py-2 text-sm font-semibold text-white md:col-span-1">
            Apply filters
          </button>
        </div>
      </form>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Create your first lead or run the database seed for demo data."
        />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Market</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Offer</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3">
                  <Link className="font-semibold text-foreground hover:text-valiant" href={`/leads/${lead.id}`}>
                    {lead.businessName}
                  </Link>
                  <div className="text-xs text-muted">{lead.websiteUrl ?? "No site"}</div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {lead.niche}
                  <div className="text-xs">
                    {lead.city}, {lead.state}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={lead.leadScore} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={lead.status} variant={stageVariant(lead.status)} />
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {lead.recommendedOffer ?? "—"}
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
