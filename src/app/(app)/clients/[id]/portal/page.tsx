import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { ClientPortalView } from "@/components/clients/client-portal-view";
import { PortalTokenManager } from "@/components/clients/portal-token-manager";
import { PrintButton } from "@/components/ui/print-button";
import { buildPortalData } from "@/lib/portal";
import { requireSessionOrg } from "@/lib/session-org";

export default async function ClientPortalPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { organizationId } = await requireSessionOrg();
  const data = await buildPortalData(params.id, organizationId);
  if (!data) notFound();

  return (
    <PageShell title="Client Portal Preview">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/clients/${params.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to client
        </Link>
        <PrintButton label="Save as PDF" />
      </div>
      <PortalTokenManager clientId={params.id} />
      <div className="rounded-xl border border-dashed border-card-border p-1">
        <ClientPortalView data={data} />
      </div>
    </PageShell>
  );
}
