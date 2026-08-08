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
      toast.success("Updated.");
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
          description="Add a verified site to pull click, impression, and position data."
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
                <th className="px-4 py-3">Avg pos</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3 font-semibold">{p.siteUrl}</td>
                  <td className="px-4 py-3 text-muted">{p.clientName ?? "—"}</td>
                  <td className="px-4 py-3">{p.clicks28d.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.impressions28d.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.avgPosition != null ? p.avgPosition.toFixed(1) : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={p.verified ? "Verified" : "Unverified"}
                      variant={p.verified ? "success" : "warning"}
                    />
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
                        onClick={() => act(p.id, "PATCH", { verified: !p.verified })}
                        className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {p.verified ? "Unverify" : "Verify"}
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
            placeholder="https://example.com/"
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
