"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type StoreRow = {
  id: string;
  name: string;
  platform: string;
  clientName: string | null;
  status: string;
  productCount: number;
  orderCount: number;
  lastSyncAt: string | null;
};

type ClientOption = { id: string; businessName: string };

const PLATFORMS = [
  "AMAZON", "EBAY", "ETSY", "SHOPIFY", "WOOCOMMERCE", "WALMART", "BIGCOMMERCE", "SQUARESPACE", "OTHER",
] as const;

function platformLabel(p: string) {
  const map: Record<string, string> = {
    AMAZON: "Amazon", EBAY: "eBay", ETSY: "Etsy", SHOPIFY: "Shopify",
    WOOCOMMERCE: "WooCommerce", WALMART: "Walmart", BIGCOMMERCE: "BigCommerce",
    SQUARESPACE: "Squarespace", OTHER: "Other",
  };
  return map[p] ?? p;
}

export function EcommerceWorkspace({
  stores,
  clients,
}: {
  stores: StoreRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("ecommerce.write");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, method: "PATCH" | "DELETE", body?: unknown) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/ecommerce/stores/${id}`, {
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
      {canWrite ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
          >
            Connect store
          </button>
        </div>
      ) : null}

      {stores.length === 0 ? (
        <EmptyState
          title="No stores connected"
          description="Connect an Amazon, eBay, Etsy, Shopify, or other ecommerce store to track products, orders, and revenue."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3">
                    <Link href={`/ecommerce/${s.id}`} className="font-semibold hover:text-valiant">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{platformLabel(s.platform)}</td>
                  <td className="px-4 py-3 text-muted">{s.clientName ?? "—"}</td>
                  <td className="px-4 py-3">{s.productCount}</td>
                  <td className="px-4 py-3">{s.orderCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={s.status}
                      variant={s.status === "connected" ? "success" : s.status === "setup_required" ? "warning" : "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {canWrite && (
                        <>
                          <button type="button" disabled={busyId === s.id} onClick={() => act(s.id, "PATCH", { action: "refresh" })} className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                            Sync
                          </button>
                          <button type="button" disabled={busyId === s.id} onClick={() => act(s.id, "DELETE")} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                            Remove
                          </button>
                        </>
                      )}
                      <Link href={`/ecommerce/${s.id}`} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConnectStoreModal
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

function ConnectStoreModal({
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
    platform: "SHOPIFY" as (typeof PLATFORMS)[number],
    name: "",
    storeUrl: "",
    clientId: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Store name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/ecommerce/stores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: f.platform,
          name: f.name.trim(),
          storeUrl: f.storeUrl.trim() || null,
          clientId: f.clientId || null,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Store connected.");
      setF({ platform: "SHOPIFY", name: "", storeUrl: "", clientId: "" });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="Connect ecommerce store" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Platform
            <select value={f.platform} onChange={(e) => setF((p) => ({ ...p, platform: e.target.value as (typeof PLATFORMS)[number] }))} className={input}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{platformLabel(p)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Client (optional)
            <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={input}>
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.businessName}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Store name
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Store URL
            <input placeholder="https://…" value={f.storeUrl} onChange={(e) => setF((p) => ({ ...p, storeUrl: e.target.value }))} className={input} />
          </label>
        </div>
        <p className="text-xs text-muted">
          A live API connection isn&apos;t configured yet, so the store starts with
          sample products, orders, and 30 days of metrics you can replace once the
          marketplace API is connected.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Connecting…" : "Connect store"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
