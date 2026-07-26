"use client";

import { LeadStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import type { LeadFormValues } from "@/components/leads/lead-form-modal";
import { LeadFormModal } from "@/components/leads/lead-form-modal";

export function LeadDetailCrud({
  lead,
}: {
  lead: {
    id: string;
    businessName: string;
    niche: string;
    city: string;
    state: string;
    websiteUrl: string | null;
    phone: string | null;
    email: string | null;
    source: string | null;
    status: LeadStatus;
    manualOpened: boolean;
    manualReplied: boolean;
    manualBooked: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const initial: Partial<LeadFormValues> = {
    businessName: lead.businessName,
    niche: lead.niche,
    city: lead.city,
    state: lead.state,
    websiteUrl: lead.websiteUrl ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "",
    status: lead.status,
  };

  async function patchLead(
    body: Record<string, unknown>,
    opts?: { quiet?: boolean },
  ) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(await errorMessageFromResponse(res));
      return false;
    }
    if (!opts?.quiet) toast.success("Saved.");
    router.refresh();
    return true;
  }

  const [pending, setPending] = useState(false);

  async function toggle(field: "manualOpened" | "manualReplied" | "manualBooked", value: boolean) {
    setPending(true);
    try {
      await patchLead({ [field]: value }, { quiet: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-semibold"
        >
          Edit lead
        </button>
        <button
          type="button"
          onClick={() => setDelOpen(true)}
          className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-100"
        >
          Delete lead
        </button>
      </div>

      <div className="rounded-lg border border-card-border bg-background/40 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Outreach signals (saved to database)
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={lead.manualOpened}
              disabled={pending}
              onChange={async (e) => {
                await toggle("manualOpened", e.target.checked);
              }}
            />
            Opened / engaged
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={lead.manualReplied}
              disabled={pending}
              onChange={async (e) => {
                await toggle("manualReplied", e.target.checked);
              }}
            />
            Positive reply
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={lead.manualBooked}
              disabled={pending}
              onChange={async (e) => {
                await toggle("manualBooked", e.target.checked);
              }}
            />
            Call booked
          </label>
        </div>
      </div>

      <LeadFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        leadId={lead.id}
        initial={initial}
      />

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Delete this lead?"
        description="This permanently removes the lead and related outreach rows where the database cascades."
        confirmLabel="Delete"
        onConfirm={async () => {
          const res = await fetch(`/api/leads/${lead.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok) {
            toast.error(await errorMessageFromResponse(res));
            throw new Error("delete failed");
          }
          toast.success("Lead deleted.");
          router.push("/leads");
          router.refresh();
        }}
      />
    </div>
  );
}
