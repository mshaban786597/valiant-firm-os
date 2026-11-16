"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

type LeadOption = { id: string; businessName: string };

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

/** Log a prospect's reply: it is labeled and follow-ups stop according to policy. */
export function LogReplyButton({ leads }: { leads: LeadOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("lead.write");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ leadId: "", body: "" });

  if (!canWrite) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.leadId || !f.body.trim()) return toast.error("Choose the lead and paste the reply.");
    setBusy(true);
    try {
      const res = await fetch("/api/outreach/replies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: f.leadId, body: f.body.trim() }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { message: string };
      toast.success(data.message);
      setF({ leadId: "", body: "" });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white"
      >
        Log a reply
      </button>
      <Modal open={open} title="Log a reply" onClose={() => !busy && setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted">
            The reply is labeled automatically. Any reply except an out-of-office stops the remaining
            follow-ups; opt-outs and bounces are added to the do-not-email list.
          </p>
          <label className="block text-xs font-semibold text-muted">
            Lead
            <select value={f.leadId} onChange={(e) => setF((p) => ({ ...p, leadId: e.target.value }))} className={input}>
              <option value="">— Choose a lead —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.businessName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Reply text
            <textarea rows={5} value={f.body} onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))} className={input} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save reply"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
