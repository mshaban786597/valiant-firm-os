"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type GbpRow = {
  id: string;
  gbpId: string;
  businessName: string;
  category: string | null;
  clientName: string | null;
  rating: number | null;
  reviewCount: number;
  postsLast30Days: number;
  lastSyncAt: string | null;
};

type ClientOption = { id: string; businessName: string };

export function GbpWorkspace({
  locations,
  clients,
}: {
  locations: GbpRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/gbp/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Insights refreshed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/gbp/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Location removed.");
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
          Add location
        </button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          title="No GBP locations yet"
          description="Add a Google Business Profile to track reviews, ratings, and posting cadence."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Reviews</th>
                <th className="px-4 py-3">Posts (30d)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3">
                    <Link href={`/gbp/${l.id}`} className="font-semibold hover:text-valiant">
                      {l.businessName}
                    </Link>
                    <div className="text-xs text-muted">{l.category ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{l.clientName ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {l.rating != null ? `★ ${l.rating.toFixed(1)}` : "—"}
                  </td>
                  <td className="px-4 py-3">{l.reviewCount}</td>
                  <td className="px-4 py-3">{l.postsLast30Days}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === l.id}
                        onClick={() => refresh(l.id)}
                        className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Refresh
                      </button>
                      <button
                        type="button"
                        disabled={busyId === l.id}
                        onClick={() => remove(l.id)}
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

      <AddLocationModal
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

function AddLocationModal({
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
    gbpId: "",
    businessName: "",
    category: "",
    phone: "",
    website: "",
    address: "",
    clientId: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.gbpId.trim() || !f.businessName.trim()) {
      toast.error("GBP ID and business name are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/gbp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gbpId: f.gbpId.trim(),
          businessName: f.businessName.trim(),
          category: f.category.trim() || null,
          phone: f.phone.trim() || null,
          website: f.website.trim() || null,
          address: f.address.trim() || null,
          clientId: f.clientId || null,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Location added.");
      setF({
        gbpId: "",
        businessName: "",
        category: "",
        phone: "",
        website: "",
        address: "",
        clientId: "",
      });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="Add GBP location" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            GBP ID / Place ID
            <input value={f.gbpId} onChange={(e) => setF((p) => ({ ...p, gbpId: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Business name
            <input value={f.businessName} onChange={(e) => setF((p) => ({ ...p, businessName: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Category
            <input value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Phone
            <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Website
            <input value={f.website} onChange={(e) => setF((p) => ({ ...p, website: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Link to client
            <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={input}>
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.businessName}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Address
            <input value={f.address} onChange={(e) => setF((p) => ({ ...p, address: e.target.value }))} className={input} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add location"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
