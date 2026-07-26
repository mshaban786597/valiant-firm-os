import { ClientPortalView } from "@/components/clients/client-portal-view";
import { buildPortalData } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function ExpiredNotice() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">Link unavailable</h1>
      <p className="mt-2 text-sm text-muted">
        This portal link has expired or been revoked. Please contact your account
        manager for an updated link.
      </p>
    </div>
  );
}

export default async function PublicPortalPage({
  params,
}: {
  params: { token: string };
}) {
  const record = await prisma.clientPortalToken.findUnique({
    where: { token: params.token },
    select: {
      id: true,
      clientId: true,
      organizationId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
    return <ExpiredNotice />;
  }

  const data = await buildPortalData(record.clientId, record.organizationId);
  if (!data) return <ExpiredNotice />;

  // Best-effort touch of last-used; never block rendering on it.
  await prisma.clientPortalToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 lg:py-12">
        <ClientPortalView data={data} />
        <p className="mt-8 text-center text-xs text-muted">
          Read-only client portal · Powered by Valiant Firm Agency OS
        </p>
      </div>
    </div>
  );
}
