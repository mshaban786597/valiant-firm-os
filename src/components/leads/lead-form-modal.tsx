"use client";

import { LeadStatus } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type LeadFormValues = {
  businessName: string;
  niche: string;
  city: string;
  state: string;
  websiteUrl: string;
  phone: string;
  email: string;
  source: string;
  status: LeadStatus;
};

const empty: LeadFormValues = {
  businessName: "",
  niche: "",
  city: "",
  state: "",
  websiteUrl: "",
  phone: "",
  email: "",
  source: "",
  status: LeadStatus.Raw,
};

function toPayload(v: LeadFormValues) {
  return {
    businessName: v.businessName.trim(),
    niche: v.niche.trim(),
    city: v.city.trim(),
    state: v.state.trim(),
    websiteUrl: v.websiteUrl.trim() || null,
    phone: v.phone.trim() || null,
    email: v.email.trim() || null,
    source: v.source.trim() || null,
    status: v.status,
  };
}

export function LeadFormModal({
  open,
  onClose,
  mode,
  leadId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  leadId?: string;
  initial?: Partial<LeadFormValues>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<LeadFormValues>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV({
      ...empty,
      ...initial,
      businessName: initial?.businessName ?? "",
      niche: initial?.niche ?? "",
      city: initial?.city ?? "",
      state: initial?.state ?? "",
      websiteUrl: initial?.websiteUrl ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      source: initial?.source ?? "",
      status: initial?.status ?? LeadStatus.Raw,
    });
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = toPayload(v);
      if (!payload.businessName || !payload.niche || !payload.city || !payload.state) {
        toast.error("Business name, niche, city, and state are required.");
        return;
      }
      const url = mode === "create" ? "/api/leads" : `/api/leads/${leadId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success(mode === "create" ? "Lead created." : "Lead updated.");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Add lead" : "Edit lead"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Business name
            <input
              required
              value={v.businessName}
              onChange={(e) => setV((p) => ({ ...p, businessName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Status
            <select
              value={v.status}
              onChange={(e) =>
                setV((p) => ({ ...p, status: e.target.value as LeadStatus }))
              }
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              {Object.values(LeadStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Niche
            <input
              required
              value={v.niche}
              onChange={(e) => setV((p) => ({ ...p, niche: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            City
            <input
              required
              value={v.city}
              onChange={(e) => setV((p) => ({ ...p, city: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            State
            <input
              required
              value={v.state}
              onChange={(e) => setV((p) => ({ ...p, state: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Website URL
            <input
              value={v.websiteUrl}
              onChange={(e) => setV((p) => ({ ...p, websiteUrl: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Email
            <input
              value={v.email}
              onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Phone
            <input
              value={v.phone}
              onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Source
            <input
              value={v.source}
              onChange={(e) => setV((p) => ({ ...p, source: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "create" ? "Create lead" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function LeadsToolbar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
      >
        Add lead
      </button>
      <LeadFormModal open={open} onClose={() => setOpen(false)} mode="create" />
    </>
  );
}
