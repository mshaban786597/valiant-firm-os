"use client";

import { DealStage } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type DealFormValues = {
  businessName: string;
  leadId: string;
  contactName: string;
  serviceInterest: string;
  monthlyValue: string;
  proposalValue: string;
  stage: DealStage;
  closeProbability: string;
};

const empty: DealFormValues = {
  businessName: "",
  leadId: "",
  contactName: "",
  serviceInterest: "",
  monthlyValue: "",
  proposalValue: "",
  stage: DealStage.Outreach,
  closeProbability: "",
};

export function DealFormModal({
  open,
  onClose,
  mode,
  dealId,
  initial,
  leadOptions,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  dealId?: string;
  initial?: Partial<DealFormValues>;
  leadOptions: { id: string; businessName: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<DealFormValues>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV({
      ...empty,
      businessName: initial?.businessName ?? "",
      leadId: initial?.leadId ?? "",
      contactName: initial?.contactName ?? "",
      serviceInterest: initial?.serviceInterest ?? "",
      monthlyValue: initial?.monthlyValue ?? "",
      proposalValue: initial?.proposalValue ?? "",
      stage: initial?.stage ?? DealStage.Outreach,
      closeProbability: initial?.closeProbability ?? "",
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
      const proposalNum =
        v.proposalValue.trim() === "" ? null : Number(v.proposalValue);
      const prob =
        v.closeProbability.trim() === "" ? null : Number(v.closeProbability);
      if (v.monthlyValue.trim() !== "" && Number.isNaN(monthlyNum)) {
        toast.error("Monthly value must be a number.");
        return;
      }
      if (v.proposalValue.trim() !== "" && Number.isNaN(proposalNum)) {
        toast.error("Proposal value must be a number.");
        return;
      }
      if (v.closeProbability.trim() !== "" && Number.isNaN(prob)) {
        toast.error("Win probability must be a number.");
        return;
      }

      const payload: Record<string, unknown> = {
        businessName: v.businessName.trim(),
        leadId: v.leadId.trim() || null,
        contactName: v.contactName.trim() || null,
        serviceInterest: v.serviceInterest.trim() || null,
        monthlyValue: monthlyNum,
        proposalValue: proposalNum,
        stage: v.stage,
        closeProbability: prob,
      };

      const url = mode === "create" ? "/api/deals" : `/api/deals/${dealId}`;
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
      toast.success(mode === "create" ? "Deal created." : "Deal updated.");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Add deal" : "Edit deal"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="text-xs font-semibold text-muted">
          Linked lead (optional)
          <select
            value={v.leadId}
            onChange={(e) => setV((p) => ({ ...p, leadId: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {leadOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.businessName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Business name
          <input
            required
            value={v.businessName}
            onChange={(e) => setV((p) => ({ ...p, businessName: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Contact name
            <input
              value={v.contactName}
              onChange={(e) => setV((p) => ({ ...p, contactName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Stage
            <select
              value={v.stage}
              onChange={(e) =>
                setV((p) => ({ ...p, stage: e.target.value as DealStage }))
              }
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              {Object.values(DealStage).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Service interest
            <input
              value={v.serviceInterest}
              onChange={(e) => setV((p) => ({ ...p, serviceInterest: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Win probability (%)
            <input
              value={v.closeProbability}
              onChange={(e) => setV((p) => ({ ...p, closeProbability: e.target.value }))}
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
            Proposal value (USD)
            <input
              value={v.proposalValue}
              onChange={(e) => setV((p) => ({ ...p, proposalValue: e.target.value }))}
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
            {busy ? "Saving…" : mode === "create" ? "Create deal" : "Save deal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PipelineToolbar({
  leadOptions,
}: {
  leadOptions: { id: string; businessName: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
      >
        Add deal
      </button>
      <DealFormModal
        open={open}
        onClose={() => setOpen(false)}
        mode="create"
        leadOptions={leadOptions}
      />
    </>
  );
}
