import { PageShell } from "@/components/layout/page-shell";
import { AiLogDeleteButton } from "@/components/ai/ai-log-delete-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";
import { money } from "@/lib/money";

export default async function AiLogsPage() {
  const { organizationId } = await requireSessionOrg();

  const logs = await prisma.aiLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const variant = (status: string) =>
    status === "success" ? ("success" as const) : ("warning" as const);

  return (
    <PageShell title="AI Agent Logs">
      <div className="rounded-xl border border-card-border bg-card p-4 text-sm text-muted">
        Logs are created when AI routes run. You can remove incorrect or noisy rows without touching
        operational leads or clients.
      </div>
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">IO</th>
              <th className="px-4 py-3">Tokens</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Related</th>
              <th className="px-4 py-3 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3 font-semibold">{log.agentName}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {log.inputType} → {log.outputType}
                </td>
                <td className="px-4 py-3 text-xs">{log.tokensUsed ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{money(log.costEstimate).toFixed(3)}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={log.status} variant={variant(log.status)} />
                </td>
                <td className="px-4 py-3 text-xs text-muted">{log.relatedRecord ?? "—"}</td>
                <td className="px-4 py-3">
                  <AiLogDeleteButton id={log.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
