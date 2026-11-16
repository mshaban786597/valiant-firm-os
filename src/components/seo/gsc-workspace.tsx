"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type GscRow = {
  id: string;
  siteUrl: string;
  clientName: string | null;
  verified: boolean;
  clicks28d: number;
  impressions28d: number;
  avgPosition: number | null;
  keywordCount: number;
  lastSyncAt: string | null;
  dataSource: string;
  syncState: string;
  stateCopy: string;
  lastAttemptAt: string | null;
  dataThrough: string | null;
  propertyType: string | null;
  ctrPct: number | null;
  disconnected: boolean;
};

type ClientOption = { id: string; businessName: string };

export function GscWorkspace({
  properties,
  clients,
}: {
  properties: GscRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, method: "PATCH" | "DELETE", body?: unknown) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/gsc/${id}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.success(data?.message ?? "Updated.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
        >
          Add property
        </button>
      </div>

      {properties.length === 0 ? (
        <EmptyState
          title="No Search Console properties"
          description="Add the exact Search Console property (for example sc-domain:example.com or https://example.com/), then test access and sync."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Clicks (28d)</th>
                <th className="px-4 py-3">Impressions</th>
                <th className="px-4 py-3">CTR</th>
                <th className="px-4 py-3">Avg pos</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{p.siteUrl}</div>
                    <div className="text-xs text-muted">
                      {p.propertyType === "domain" ? "Domain property" : p.propertyType === "url_prefix" ? "URL-prefix property" : "Property type not verified"}
                      {" · read-only"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.clientName ?? "—"}</td>
                  <td className="px-4 py-3">{p.clicks28d.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.impressions28d.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.ctrPct != null ? `${p.ctrPct.toFixed(1)}%` : "—"}</td>
                  <td className="px-4 py-3">{p.avgPosition != null ? p.avgPosition.toFixed(1) : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <StatusBadge
                      label={p.disconnected ? "Disconnected" : p.dataSource === "live" ? "Live (Search Console)" : p.dataSource === "sample" ? "Sample data" : "No data yet"}
                      variant={p.disconnected ? "neutral" : p.dataSource === "live" ? "success" : p.dataSource === "sample" ? "warning" : "neutral"}
                    />
                    <div className="mt-1 text-muted">{p.stateCopy}</div>
                    <div className="text-muted">
                      Last attempt {p.lastAttemptAt ? new Date(p.lastAttemptAt).toLocaleString() : "never"} · last success{" "}
                      {p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString() : "never"}
                      {p.dataThrough ? ` · data through ${p.dataThrough.slice(0, 10)}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => act(p.id, "PATCH", { action: "refresh" })}
                        className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Sync
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => act(p.id, "PATCH", { action: "test" })}
                        className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Test access
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => act(p.id, "PATCH", { action: "disconnect" })}
                        className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => act(p.id, "DELETE")}
                        className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddPropertyModal
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function AddPropertyModal({
  open,
  onClose,
  clients,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [clientId, setClientId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteUrl.trim()) return toast.error("Site URL is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/gsc", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: siteUrl.trim(), clientId: clientId || null }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Property added.");
      setSiteUrl("");
      setClientId("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="Add Search Console property" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs font-semibold text-muted">
          Site URL
          <input
            placeholder="sc-domain:example.com or https://example.com/"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            className={input}
          />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Link to client (optional)
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.businessName}</option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add property"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
