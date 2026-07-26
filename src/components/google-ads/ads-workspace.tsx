"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { formatCents } from "@/lib/money";

export type AdsRow = {
  id: string;
  campaignName: string;
  clientName: string | null;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  costPerConv: number | null;
};

type ClientOption = { id: string; businessName: string };

export function AdsWorkspace({
  campaigns,
  clients,
}: {
  campaigns: AdsRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, method: "PATCH" | "DELETE", body?: unknown) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/google-ads/${id}`, {
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
          Add campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Add a Google Ads campaign to track spend, clicks, and conversions."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Conv.</th>
                <th className="px-4 py-3">CPA</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3 font-semibold">{c.campaignName}</td>
                  <td className="px-4 py-3 text-muted">{c.clientName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={c.status}
                      variant={c.status === "ENABLED" ? "success" : "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{formatCents(c.spend)}</td>
                  <td className="px-4 py-3">{c.clicks.toLocaleString()}</td>
                  <td className="px-4 py-3">{c.conversions.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {c.costPerConv != null ? formatCents(c.costPerConv) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => act(c.id, "PATCH", { action: "refresh" })}
                        className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Sync
                      </button>
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => act(c.id, "DELETE")}
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

      <AddCampaignModal
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

function AddCampaignModal({
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
  const [f, setF] = useState({ campaignId: "", campaignName: "", clientId: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.campaignId.trim() || !f.campaignName.trim()) {
      return toast.error("Campaign ID and name are required.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/google-ads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: f.campaignId.trim(),
          campaignName: f.campaignName.trim(),
          clientId: f.clientId || null,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Campaign added.");
      setF({ campaignId: "", campaignName: "", clientId: "" });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="Add Google Ads campaign" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs font-semibold text-muted">
          Campaign ID
          <input value={f.campaignId} onChange={(e) => setF((p) => ({ ...p, campaignId: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Campaign name
          <input value={f.campaignName} onChange={(e) => setF((p) => ({ ...p, campaignName: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Link to client (optional)
          <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={input}>
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
            {busy ? "Adding…" : "Add campaign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
