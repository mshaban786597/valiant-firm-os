"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type IntegrationRow = {
  id: string;
  name: string;
  category: string;
  powers: string;
  connected: boolean;
  missing: string[];
  data: "live" | "sample" | "planned" | "imported";
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestDetail: string | null;
  lastLiveVerifiedAt: string | null;
};

export type NotificationRow = {
  id: string;
  channel: string;
  event: string;
  title: string;
  status: string;
  error: string | null;
  providerRef: string | null;
  createdAt: string;
};

function dataBadge(row: IntegrationRow) {
  if (row.data === "live") return { label: "Supports live data", variant: "info" as const };
  if (row.data === "imported") return { label: "Imported through Claude", variant: "info" as const };
  if (row.data === "sample") return { label: "No data until connected", variant: "warning" as const };
  return { label: "Connection test only", variant: "neutral" as const };
}

export function IntegrationsWorkspace({
  rows,
  notifications,
}: {
  rows: IntegrationRow[];
  notifications: NotificationRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const can = useCan();
  const canTest = can("integration.write");
  const canAlert = can("org.settings");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const categories: string[] = [];
  rows.forEach((r) => {
    if (categories.indexOf(r.category) === -1) categories.push(r.category);
  });

  async function test(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/integrations/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { ok: boolean; detail: string };
      setResults((p) => ({ ...p, [id]: data }));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function sendTestAlert() {
    setBusy("alert");
    try {
      const res = await fetch("/api/notifications/test", { method: "POST", credentials: "include" });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { results: { channel: string; status: string }[] };
      const sent = data.results.filter((r) => r.status === "sent").map((r) => r.channel);
      const failed = data.results.filter((r) => r.status === "failed").map((r) => r.channel);
      if (sent.length) toast.success(`Test alert sent to: ${sent.join(", ")}.`);
      else if (failed.length) toast.error(`Test alert failed on: ${failed.join(", ")}.`);
      else toast.error("No alert channel is connected yet. Add email, Slack or Telegram first.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <section key={cat} className="space-y-2">
          <h2 className="text-sm font-semibold">{cat}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows
              .filter((r) => r.category === cat)
              .map((r) => {
                const badge = dataBadge(r);
                const result = results[r.id];
                return (
                  <div key={r.id} className="rounded-xl border border-card-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{r.name}</div>
                      <StatusBadge
                        label={r.connected ? "Connected" : "Not connected"}
                        variant={r.connected ? "success" : "neutral"}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted">{r.powers}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge label={badge.label} variant={badge.variant} />
                      {r.lastLiveVerifiedAt ? (
                        <StatusBadge label={`Live verified ${new Date(r.lastLiveVerifiedAt).toLocaleDateString()}`} variant="success" />
                      ) : null}
                      {canTest ? (
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => test(r.id)}
                          className="rounded-lg border border-card-border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          {busy === r.id ? "Testing…" : "Test connection"}
                        </button>
                      ) : null}
                    </div>
                    {!r.connected && r.missing.length ? (
                      <p className="mt-2 break-words text-[11px] text-muted">
                        To connect, set: <span className="font-mono">{r.missing.join(", ")}</span>
                      </p>
                    ) : null}
                    {!result && r.lastTestAt ? (
                      <p className="mt-2 text-[11px] text-muted">
                        Last test {new Date(r.lastTestAt).toLocaleString()}: {r.lastTestOk ? "passed" : "failed"}
                        {r.lastTestDetail ? ` (${r.lastTestDetail})` : ""}
                      </p>
                    ) : null}
                    {result ? (
                      <p
                        className={`mt-2 text-xs font-medium ${result.ok ? "text-emerald-600 dark:text-emerald-300" : "text-valiant dark:text-red-300"}`}
                      >
                        {result.detail}
                      </p>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent alerts</h2>
          {canAlert ? (
            <button
              type="button"
              disabled={busy === "alert"}
              onClick={sendTestAlert}
              className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "alert" ? "Sending…" : "Send test alert"}
            </button>
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <EmptyState
            title="No alerts yet"
            description="Alerts for website issues, new leads and approvals are listed here with what was actually delivered."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Alert</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id} className="border-t border-card-border">
                    <td className="px-4 py-3">{n.title}</td>
                    <td className="px-4 py-3 capitalize text-muted">{n.channel}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={n.status === "skipped" ? "Not attempted" : n.status === "sent" ? "Accepted by provider" : "Failed"}
                        variant={n.status === "sent" ? "success" : n.status === "failed" ? "danger" : "neutral"}
                      />
                      {n.error ? <span className="ml-2 text-xs text-muted">{n.error}</span> : null}
                      {n.providerRef ? <span className="ml-2 text-xs text-muted">ref {n.providerRef}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {new Date(n.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
