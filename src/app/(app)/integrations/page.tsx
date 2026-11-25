import { PageShell } from "@/components/layout/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  IntegrationsWorkspace,
  type IntegrationRow,
  type NotificationRow,
} from "@/components/integrations/integrations-workspace";
import { INTEGRATIONS, integrationState, missingEnv } from "@/lib/integrations/catalog";
import { prisma } from "@/lib/prisma";
import { signedInTools } from "@/lib/integrations/oauth-state";
import { requireSessionOrg } from "@/lib/session-org";
import { getDataScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage(
  props: { searchParams?: Promise<{ ubersuggest?: string; reason?: string }> }
) {
  const searchParams = await props.searchParams;
  const { organizationId } = await requireSessionOrg();
  const signedIn = await signedInTools(organizationId);
  const needsReauth = (
    await prisma.oAuthConnection.findMany({ where: { organizationId, status: "needs_reauth" }, select: { provider: true } })
  ).map((c) => c.provider);

  const verifications = await prisma.integrationVerification.findMany({ where: { organizationId } });
  const verified: Record<string, (typeof verifications)[number]> = {};
  verifications.forEach((v) => (verified[v.integrationId] = v));

  const rows: IntegrationRow[] = INTEGRATIONS.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    powers: t.powers,
    connected: integrationState(t, process.env, signedIn) === "connected",
    // Env var NAMES only — values never leave the server.
    missing: missingEnv(t),
    signIn: t.oauth ? (signedIn.indexOf(t.id) !== -1 ? "connected" : needsReauth.indexOf(t.id) !== -1 ? "needs_reauth" : "not_connected") : null,
    data: t.data,
    lastTestAt: verified[t.id]?.lastTestAt?.toISOString() ?? null,
    lastTestOk: verified[t.id]?.lastTestOk ?? null,
    lastTestDetail: verified[t.id]?.lastTestDetail ?? null,
    lastLiveVerifiedAt: verified[t.id]?.lastLiveVerifiedAt?.toISOString() ?? null,
  }));

  const logs = await prisma.notificationLog.findMany({
    where: { organizationId, isDemo: getDataScope().isDemo },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const notifications: NotificationRow[] = logs.map((n) => ({
    id: n.id,
    channel: n.channel,
    event: n.event,
    title: n.title,
    status: n.status,
    error: n.error,
    providerRef: n.providerRef,
    createdAt: n.createdAt.toISOString(),
  }));

  const connected = rows.filter((r) => r.connected).length;
  const live = rows.filter((r) => r.connected && r.data === "live").length;
  const liveVerified = rows.filter((r) => r.lastLiveVerifiedAt).length;
  const connectedNames = rows.filter((r) => r.connected).map((r) => r.name);

  return (
    <PageShell title="Integrations">
      {searchParams?.ubersuggest === "connected" ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Ubersuggest is connected.</div>
      ) : searchParams?.ubersuggest === "failed" ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
          Ubersuggest was not connected. {(searchParams.reason ?? "").slice(0, 240)}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tools in the system" value={String(rows.length)} />
        <KpiCard
          label="Connected"
          value={`${connected}/${rows.length}`}
          hint={connectedNames.length ? connectedNames.join(", ") : "None"}
        />
        <KpiCard label="Live verified" value={String(liveVerified)} hint="A real provider call succeeded" />
        <KpiCard label="Running on live data" value={String(live)} />
      </div>
      <IntegrationsWorkspace rows={rows} notifications={notifications} />
    </PageShell>
  );
}
