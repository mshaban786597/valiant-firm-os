"use client";

import { DealStage } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import type { DealFormValues } from "@/components/pipeline/deal-form-modal";
import { DealFormModal } from "@/components/pipeline/deal-form-modal";

export type PipelineDeal = {
  id: string;
  businessName: string;
  stage: DealStage;
  monthlyValue: number | null;
  closeProbability: number | null;
  leadId: string | null;
  contactName: string | null;
  serviceInterest: string | null;
  proposalValue: number | null;
};

const STAGES: DealStage[] = [
  DealStage.Outreach,
  DealStage.Replied,
  DealStage.CallBooked,
  DealStage.ProposalSent,
  DealStage.Negotiation,
  DealStage.ClosedWon,
  DealStage.ClosedLost,
];

export function PipelineBoard({
  deals,
  leadOptions,
}: {
  deals: PipelineDeal[];
  leadOptions: { id: string; businessName: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [local, setLocal] = useState(deals);
  const [edit, setEdit] = useState<PipelineDeal | null>(null);
  const [del, setDel] = useState<PipelineDeal | null>(null);

  useEffect(() => {
    setLocal(deals);
  }, [deals]);

  const grouped = new Map<DealStage, PipelineDeal[]>();
  for (const s of STAGES) grouped.set(s, []);
  for (const d of local) {
    grouped.get(d.stage)?.push(d);
  }

  async function moveDeal(id: string, stage: DealStage) {
    const res = await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      toast.error(await errorMessageFromResponse(res));
      return;
    }
    const json = (await res.json()) as { deal: { id: string; stage: DealStage } };
    toast.success("Stage updated.");
    setLocal((prev) =>
      prev.map((d) => (d.id === json.deal.id ? { ...d, stage: json.deal.stage } : d)),
    );
    router.refresh();
  }

  async function removeDeal(id: string) {
    const res = await fetch(`/api/deals/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await errorMessageFromResponse(res));
      throw new Error("delete failed");
    }
    toast.success("Deal removed.");
    setLocal((prev) => prev.filter((d) => d.id !== id));
    router.refresh();
  }

  const editInitial: Partial<DealFormValues> | undefined = edit
    ? {
        businessName: edit.businessName,
        leadId: edit.leadId ?? "",
        contactName: edit.contactName ?? "",
        serviceInterest: edit.serviceInterest ?? "",
        monthlyValue: edit.monthlyValue != null ? String(edit.monthlyValue) : "",
        proposalValue: edit.proposalValue != null ? String(edit.proposalValue) : "",
        stage: edit.stage,
        closeProbability:
          edit.closeProbability != null ? String(edit.closeProbability) : "",
      }
    : undefined;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-7">
        {STAGES.map((stage) => (
          <div key={stage} className="rounded-xl border border-card-border bg-card/60 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {stage.replace(/([A-Z])/g, " $1").trim()}
            </div>
            <div className="space-y-2">
              {(grouped.get(stage) ?? []).map((deal) => (
                <div
                  key={deal.id}
                  className="rounded-lg border border-card-border bg-background/40 p-3 text-xs shadow-sm"
                >
                  <div className="font-semibold text-foreground">{deal.businessName}</div>
                  <div className="mt-1 text-muted">
                    MRR {deal.monthlyValue != null ? `$${deal.monthlyValue}` : "—"} · Win{" "}
                    {deal.closeProbability ?? "—"}%
                  </div>
                  <label className="mt-2 block text-[11px] font-semibold text-muted">
                    Move
                    <select
                      className="mt-1 w-full rounded-md border border-card-border bg-card px-2 py-1 text-xs text-foreground"
                      value={deal.stage}
                      onChange={(e) => moveDeal(deal.id, e.target.value as DealStage)}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEdit(deal)}
                      className="rounded-md border border-card-border px-2 py-1 text-[11px] font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDel(deal)}
                      className="rounded-md border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {edit ? (
        <DealFormModal
          open
          onClose={() => setEdit(null)}
          mode="edit"
          dealId={edit.id}
          initial={editInitial}
          leadOptions={leadOptions}
        />
      ) : null}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete this deal?"
        description={del ? del.businessName : undefined}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!del) return;
          await removeDeal(del.id);
        }}
      />
    </>
  );
}
