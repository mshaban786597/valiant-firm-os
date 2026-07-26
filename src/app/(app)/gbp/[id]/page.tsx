import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function GbpDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organizationId } = await requireSessionOrg();

  const location = await prisma.gbpLocation.findFirst({
    where: { id: params.id, organizationId },
    include: { client: { select: { id: true, businessName: true } } },
  });
  if (!location) notFound();

  return (
    <PageShell title={location.businessName}>
      <Link
        href="/gbp"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to locations
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Rating"
          value={location.rating != null ? `★ ${location.rating.toFixed(1)}` : "—"}
        />
        <KpiCard label="Reviews" value={String(location.reviewCount)} />
        <KpiCard label="Posts (30d)" value={String(location.postsLast30Days)} />
      </div>

      <div className="rounded-xl border border-card-border bg-card p-5 text-sm">
        <h3 className="text-sm font-semibold">Profile details</h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="GBP ID" value={location.gbpId} />
          <Detail label="Category" value={location.category ?? "—"} />
          <Detail label="Phone" value={location.phone ?? "—"} />
          <Detail
            label="Website"
            value={location.website ?? "—"}
            href={location.website ?? undefined}
          />
          <Detail label="Address" value={location.address ?? "—"} />
          <Detail
            label="Linked client"
            value={location.client?.businessName ?? "Unlinked"}
            href={location.client ? `/clients/${location.client.id}` : undefined}
          />
          <Detail
            label="Last synced"
            value={
              location.lastSyncAt
                ? location.lastSyncAt.toLocaleString()
                : "Never"
            }
          />
        </dl>
      </div>
    </PageShell>
  );
}

function Detail({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">
        {href ? (
          <Link href={href} className="text-valiant hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
