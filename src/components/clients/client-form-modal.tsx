"use client";

import { ClientStatus } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type ClientFormValues = {
  businessName: string;
  primaryContact: string;
  email: string;
  phone: string;
  websiteUrl: string;
  servicePurchased: string;
  monthlyValue: string;
  contractStart: string;
  status: ClientStatus;
  healthScore: string;
  assignedSeoLead: string;
  targetLocations: string;
  targetServices: string;
};

const empty: ClientFormValues = {
  businessName: "",
  primaryContact: "",
  email: "",
  phone: "",
  websiteUrl: "",
  servicePurchased: "",
  monthlyValue: "",
  contractStart: "",
  status: ClientStatus.Onboarding,
  healthScore: "",
  assignedSeoLead: "",
  targetLocations: "",
  targetServices: "",
};

function splitList(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function ClientFormModal({
  open,
  onClose,
  mode,
  clientId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  clientId?: string;
  initial?: Partial<ClientFormValues>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<ClientFormValues>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV({
      ...empty,
      ...initial,
      businessName: initial?.businessName ?? "",
      primaryContact: initial?.primaryContact ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      websiteUrl: initial?.websiteUrl ?? "",
      servicePurchased: initial?.servicePurchased ?? "",
      monthlyValue: initial?.monthlyValue ?? "",
      contractStart: initial?.contractStart ?? "",
      status: initial?.status ?? ClientStatus.Onboarding,
      healthScore: initial?.healthScore ?? "",
      assignedSeoLead: initial?.assignedSeoLead ?? "",
      targetLocations: initial?.targetLocations ?? "",
      targetServices: initial?.targetServices ?? "",
    });
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.businessName.trim()) {
      toast.error("Business name is required.");
      return;
    }
    setBusy(true);
    try {
      const monthlyNum =
        v.monthlyValue.trim() === "" ? null : Number(v.monthlyValue);
      if (v.monthlyValue.trim() !== "" && Number.isNaN(monthlyNum)) {
        toast.error("Monthly value must be a number.");
        return;
      }
      const healthNum =
        v.healthScore.trim() === "" ? null : Number(v.healthScore);
      if (v.healthScore.trim() !== "" && Number.isNaN(healthNum)) {
        toast.error("Health score must be a number.");
        return;
      }
      const contractIso =
        v.contractStart.trim() === ""
          ? null
          : new Date(`${v.contractStart}T12:00:00.000Z`).toISOString();

      const payload: Record<string, unknown> = {
        businessName: v.businessName.trim(),
        primaryContact: v.primaryContact.trim() || null,
        email: v.email.trim() || null,
        phone: v.phone.trim() || null,
        websiteUrl: v.websiteUrl.trim() || null,
        servicePurchased: v.servicePurchased.trim() || null,
        monthlyValue: monthlyNum,
        contractStart: contractIso,
        status: v.status,
        healthScore: healthNum,
        assignedSeoLead: v.assignedSeoLead.trim() || null,
        targetLocations: splitList(v.targetLocations),
        targetServices: splitList(v.targetServices),
      };

      const url = mode === "create" ? "/api/clients" : `/api/clients/${clientId}`;
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
      toast.success(mode === "create" ? "Client created." : "Client updated.");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Add client" : "Edit client"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted sm:col-span-2">
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
                setV((p) => ({ ...p, status: e.target.value as ClientStatus }))
              }
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              {Object.values(ClientStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Health score (0–100, optional)
            <input
              value={v.healthScore}
              onChange={(e) => setV((p) => ({ ...p, healthScore: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Primary contact
            <input
              value={v.primaryContact}
              onChange={(e) => setV((p) => ({ ...p, primaryContact: e.target.value }))}
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
          <label className="text-xs font-semibold text-muted">
            Website
            <input
              value={v.websiteUrl}
              onChange={(e) => setV((p) => ({ ...p, websiteUrl: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Service purchased
            <input
              value={v.servicePurchased}
              onChange={(e) => setV((p) => ({ ...p, servicePurchased: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Monthly value (USD)
            <input
              value={v.monthlyValue}
              onChange={(e) => setV((p) => ({ ...p, monthlyValue: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Contract start (date)
            <input
              type="date"
              value={v.contractStart}
              onChange={(e) => setV((p) => ({ ...p, contractStart: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Assigned SEO lead
            <input
              value={v.assignedSeoLead}
              onChange={(e) => setV((p) => ({ ...p, assignedSeoLead: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Target locations (comma-separated)
            <input
              value={v.targetLocations}
              onChange={(e) => setV((p) => ({ ...p, targetLocations: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">
            Target services (comma-separated)
            <input
              value={v.targetServices}
              onChange={(e) => setV((p) => ({ ...p, targetServices: e.target.value }))}
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
            {busy ? "Saving…" : mode === "create" ? "Create client" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ClientsToolbar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
      >
        Add client
      </button>
      <ClientFormModal open={open} onClose={() => setOpen(false)} mode="create" />
    </>
  );
}
