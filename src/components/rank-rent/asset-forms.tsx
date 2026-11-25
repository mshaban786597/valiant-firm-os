"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { RANK_RENT_STATUSES, RANK_RENT_STATUS_LABEL } from "@/lib/schemas/rank-rent";

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

async function send(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Add one of our own lead-generation sites. */
export function AddAssetButton() {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("client.write");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ domain: "", niche: "", city: "", state: "", status: "SiteBuilt" });
  if (!canWrite) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await send("/api/rank-rent", "POST", f);
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success(((await res.json()) as { message: string }).message);
      setF({ domain: "", niche: "", city: "", state: "", status: "SiteBuilt" });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white">
        Add a site
      </button>
      <Modal open={open} title="Add a rank-and-rent site" onClose={() => !busy && setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted">
            Traffic and leads are read from Search Console, Analytics and the site checks for this domain. To see them,
            the site also needs to be added to Monitoring and connected in Search Console and Analytics.
          </p>
          <label className="block text-xs font-semibold text-muted">
            Domain
            <input value={f.domain} onChange={(e) => setF((p) => ({ ...p, domain: e.target.value }))} placeholder="example.com" className={input} />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Niche
            <input value={f.niche} onChange={(e) => setF((p) => ({ ...p, niche: e.target.value }))} placeholder="Water treatment" className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-muted">
              City / market
              <input value={f.city} onChange={(e) => setF((p) => ({ ...p, city: e.target.value }))} className={input} />
            </label>
            <label className="block text-xs font-semibold text-muted">
              State
              <input value={f.state} onChange={(e) => setF((p) => ({ ...p, state: e.target.value }))} placeholder="TX" className={input} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-muted">
            Stage
            <select value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))} className={input}>
              {RANK_RENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RANK_RENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Add site"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Change the stage, the renter and the monthly rent. */
export function EditAssetButton({
  asset,
}: {
  asset: { id: string; domain: string; status: string; renterStatus: string | null; monthlyRevenue: number | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("client.write");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    status: asset.status,
    renterStatus: asset.renterStatus ?? "",
    monthlyRevenue: asset.monthlyRevenue === null ? "" : String(asset.monthlyRevenue),
  });
  if (!canWrite) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rent = f.monthlyRevenue.trim() === "" ? null : Number(f.monthlyRevenue);
    if (rent !== null && !(rent >= 0)) return toast.error("Monthly rent must be a number.");
    setBusy(true);
    try {
      const res = await send(`/api/rank-rent/${asset.id}`, "PATCH", {
        status: f.status,
        renterStatus: f.renterStatus,
        monthlyRevenue: rent,
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Saved.");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold">
        Edit
      </button>
      <Modal open={open} title={asset.domain} onClose={() => !busy && setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-semibold text-muted">
            Stage
            <select value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))} className={input}>
              {RANK_RENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RANK_RENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Renter (leave empty if not rented)
            <input value={f.renterStatus} onChange={(e) => setF((p) => ({ ...p, renterStatus: e.target.value }))} placeholder="Business renting the leads" className={input} />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Monthly rent in dollars (leave empty if none)
            <input inputMode="decimal" value={f.monthlyRevenue} onChange={(e) => setF((p) => ({ ...p, monthlyRevenue: e.target.value }))} className={input} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
