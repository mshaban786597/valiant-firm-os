"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { formatCents } from "@/lib/money";

export type CampaignRow = {
  id: string;
  name: string;
  clientName: string | null;
  channel: string;
  status: string;
  budgetCents: number;
};

type ClientOption = { id: string; businessName: string };

const CHANNELS = ["GOOGLE_ADS", "META", "SEO", "GBP", "EMAIL", "SMM", "ECOMMERCE", "OTHER"] as const;

function channelLabel(c: string) {
  return c.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}
function statusVariant(s: string) {
  if (s === "active") return "success" as const;
  if (s === "paused") return "warning" as const;
  if (s === "completed") return "neutral" as const;
  return "info" as const;
}

export function CampaignsWorkspace({
  campaigns,
  clients,
}: {
  campaigns: CampaignRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("campaign.write");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Campaign removed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
          >
            New campaign
          </button>
        </div>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a campaign per channel (Google Ads, Meta, SEO, Email, Ecommerce…) for a client."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Status</th>
                {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3 font-semibold">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{channelLabel(c.channel)}</td>
                  <td className="px-4 py-3">{c.budgetCents ? formatCents(c.budgetCents) : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={c.status} variant={statusVariant(c.status)} />
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => remove(c.id)}
                        className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewCampaignModal
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

function NewCampaignModal({
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
  const [f, setF] = useState({
    clientId: "",
    channel: "GOOGLE_ADS" as (typeof CHANNELS)[number],
    name: "",
    status: "active",
    budget: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.clientId) return toast.error("Select a client.");
    if (!f.name.trim()) return toast.error("Campaign name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: f.clientId,
          channel: f.channel,
          name: f.name.trim(),
          status: f.status,
          budgetDollars: f.budget ? Number(f.budget) : undefined,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Campaign created.");
      setF({ clientId: "", channel: "GOOGLE_ADS", name: "", status: "active", budget: "" });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="New campaign" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Client
            <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={input}>
              <option value="">— Select —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.businessName}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Channel
            <select value={f.channel} onChange={(e) => setF((p) => ({ ...p, channel: e.target.value as (typeof CHANNELS)[number] }))} className={input}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{channelLabel(c)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Campaign name
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Status
            <select value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))} className={input}>
              {["active", "paused", "completed", "draft"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Monthly budget (USD)
            <input inputMode="decimal" value={f.budget} onChange={(e) => setF((p) => ({ ...p, budget: e.target.value }))} className={input} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create campaign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
