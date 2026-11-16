"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { AddWebsiteButton, RunAllButton } from "@/components/automation/site-actions";

export type MonitorRow = {
  id: string;
  name: string;
  type: string;
  target: string;
  clientName: string | null;
  enabled: boolean;
  lastStatus: string | null;
  lastCheckAt: string | null;
  incidentCount: number;
};

export type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  occurrenceCount: number;
  monitorName: string | null;
  firstSeenAt: string;
};

type ClientOption = { id: string; businessName: string };

const MONITOR_TYPES = [
  "UPTIME", "ROUTE", "DNS", "TLS", "PAGE_SPEED", "BROKEN_LINKS", "SECURITY",
  "INDEXING", "CONTENT_CHANGE", "MOBILE", "LEAD_ROUTE", "CUSTOM",
] as const;

function statusVariant(s: string | null) {
  if (s === "ok") return "success" as const;
  if (s === "fail") return "danger" as const;
  return "neutral" as const;
}
function sevVariant(s: string) {
  if (s === "CRITICAL") return "danger" as const;
  if (s === "WARNING") return "warning" as const;
  return "info" as const;
}

export function MonitoringWorkspace({
  monitors,
  incidents,
  clients,
}: {
  monitors: MonitorRow[];
  incidents: IncidentRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("monitor.write");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function monitorAction(id: string, action: "run" | "simulate-fail" | "delete") {
    setBusyId(id);
    try {
      let res: Response;
      if (action === "delete") {
        res = await fetch(`/api/monitors/${id}`, { method: "DELETE", credentials: "include" });
      } else {
        res = await fetch(`/api/monitors/${id}/run`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "simulate-fail"
              ? { simulate: "fail", detail: "Simulated outage (pilot)" }
              : {},
          ),
        });
      }
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      if (action !== "delete") {
        const data = (await res.json()) as { outcome: { action: string } };
        toast.success(`Check recorded: ${data.outcome.action.replace(/_/g, " ")}`);
      } else {
        toast.success("Monitor removed.");
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function incidentAction(id: string, status: "ACKNOWLEDGED" | "RESOLVED") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success(`Incident ${status.toLowerCase()}.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Open incidents */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Open incidents</h2>
        {incidents.length === 0 ? (
          <EmptyState title="No open incidents" description="All monitored checks are healthy." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Incident</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Occurrences</th>
                  {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="border-t border-card-border hover:bg-background/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{i.title}</div>
                      <div className="text-xs text-muted">{i.monitorName ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge label={i.severity} variant={sevVariant(i.severity)} /></td>
                    <td className="px-4 py-3"><StatusBadge label={i.status} variant={i.status === "OPEN" ? "danger" : "warning"} /></td>
                    <td className="px-4 py-3">{i.occurrenceCount}</td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {i.status === "OPEN" && (
                            <button type="button" disabled={busyId === i.id} onClick={() => incidentAction(i.id, "ACKNOWLEDGED")} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">Acknowledge</button>
                          )}
                          <button type="button" disabled={busyId === i.id} onClick={() => incidentAction(i.id, "RESOLVED")} className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Resolve</button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monitors */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Monitors</h2>
          {canWrite ? (
            <div className="flex flex-wrap justify-end gap-2">
              <RunAllButton label="Run all checks" />
              <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold">
                Add single check
              </button>
              <AddWebsiteButton clients={clients} />
            </div>
          ) : null}
        </div>
        {monitors.length === 0 ? (
          <EmptyState title="No checks yet" description="Add a website to start uptime, speed, security, indexing, broken link and content checks." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Monitor</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Last status</th>
                  {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id} className="border-t border-card-border hover:bg-background/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-xs text-muted">{m.target}</div>
                    </td>
                    <td className="px-4 py-3 text-muted">{m.type}</td>
                    <td className="px-4 py-3 text-muted">{m.clientName ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge label={m.lastStatus === "ok" ? "Passing" : m.lastStatus === "fail" ? "Failing" : m.lastStatus === "unknown" ? "Not measured" : "Not checked yet"} variant={statusVariant(m.lastStatus)} /></td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" disabled={busyId === m.id} onClick={() => monitorAction(m.id, "run")} className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Run check</button>
                          <button type="button" disabled={busyId === m.id} onClick={() => monitorAction(m.id, "simulate-fail")} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" title="Simulate an outage (pilot)">Simulate fail</button>
                          <button type="button" disabled={busyId === m.id} onClick={() => monitorAction(m.id, "delete")} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">Remove</button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddMonitorModal open={open} onClose={() => setOpen(false)} clients={clients} onCreated={() => { setOpen(false); router.refresh(); }} />
    </div>
  );
}

function AddMonitorModal({
  open, onClose, clients, onCreated,
}: {
  open: boolean; onClose: () => void; clients: ClientOption[]; onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", type: "UPTIME" as (typeof MONITOR_TYPES)[number], target: "", clientId: "", cadenceMinutes: "15" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.target.trim()) return toast.error("Name and target are required.");
    setBusy(true);
    try {
      const res = await fetch("/api/monitors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name.trim(),
          type: f.type,
          target: f.target.trim(),
          clientId: f.clientId || null,
          cadenceMinutes: Number(f.cadenceMinutes) || 15,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Monitor added.");
      setF({ name: "", type: "UPTIME", target: "", clientId: "", cadenceMinutes: "15" });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="Add monitor" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Name
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Type
            <select value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value as (typeof MONITOR_TYPES)[number] }))} className={input}>
              {MONITOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Cadence (minutes)
            <input inputMode="numeric" value={f.cadenceMinutes} onChange={(e) => setF((p) => ({ ...p, cadenceMinutes: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Target (URL or host)
            <input placeholder="https://example.com" value={f.target} onChange={(e) => setF((p) => ({ ...p, target: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Client (optional)
            <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={input}>
              <option value="">— None —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Adding…" : "Add monitor"}</button>
        </div>
      </form>
    </Modal>
  );
}
