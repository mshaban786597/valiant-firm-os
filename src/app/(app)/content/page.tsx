import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function ContentPage() {
  const { organizationId } = await requireSessionOrg();

  const items = await prisma.contentItem.findMany({
    where: { organizationId },
    include: { client: { select: { businessName: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <PageShell title="Content Pipeline">
      <div className="overflow-hidden rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Keyword</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3 font-semibold">{c.title}</td>
                <td className="px-4 py-3 text-xs text-muted">{c.targetKeyword}</td>
                <td className="px-4 py-3 text-xs">
                  <Link className="hover:text-valiant" href={`/clients/${c.clientId}`}>
                    {c.client.businessName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={c.status} variant="info" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
