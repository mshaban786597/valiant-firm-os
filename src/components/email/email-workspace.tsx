"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { parseEmails } from "@/lib/email/parse-emails";

export type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  status: string;
  recipientCount: number;
  /** Emails the email service accepted. */
  delivered: number;
  /** What happened to the recipients once sending started; null for a draft. */
  progress: string | null;
  opens: number;
  clicks: number;
  unsubscribes: number;
  sentAt: string | null;
};

function statusVariant(status: string) {
  if (status === "sent") return "success" as const;
  if (status === "sending" || status === "scheduled") return "info" as const;
  return "warning" as const;
}

export function EmailWorkspace({
  campaigns,
  sending,
}: {
  campaigns: CampaignRow[];
  sending: { on: boolean; text: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  async function addPasted() {
    const emails = parseEmails(pasted);
    if (!pasteFor || emails.length === 0) return toast.error("No email address found.");
    const id = pasteFor;
    setPasteFor(null);
    setPasted("");
    await addRecipients(id, { emails });
  }

  async function addRecipients(id: string, what: { source: "clients" | "leads" } | { emails: string[] }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/email-campaigns/${id}/recipients`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(what),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { added: number; total: number };
      toast.success(`Added ${data.added} recipients (${data.total} total).`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function send(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/email-campaigns/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { sent: number; refused: number; skipped: number; remaining: number };
      const parts = [`${data.sent} sent`];
      if (data.remaining) parts.push(`${data.remaining} waiting, they go out over the next hours`);
      if (data.refused) parts.push(`${data.refused} refused`);
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      toast.success(`${parts.join(" · ")}.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/email-campaigns/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Campaign deleted.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          <span className={sending.on ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-amber-700 dark:text-amber-400"}>
            {sending.on ? "Sending is on." : "Sending is off."}
          </span>{" "}
          {sending.text}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
        >
          New campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="No email campaigns yet"
          description="Draft a campaign, add recipients from your leads or clients, then send."
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const openRate = c.delivered ? Math.round((c.opens / c.delivered) * 100) : null;
            const busy = busyId === c.id;
            const isDraft = c.status === "draft";
            return (
              <div key={c.id} className="rounded-xl border border-card-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="section-title">{c.name}</h3>
                      <StatusBadge label={c.status} variant={statusVariant(c.status)} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{c.subject}</p>
                    {c.progress && <p className="mt-1 text-xs text-muted">{c.progress}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isDraft && (
                      <>
                        <button type="button" disabled={busy} onClick={() => addRecipients(c.id, { source: "clients" })} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                          + Clients
                        </button>
                        <button type="button" disabled={busy} onClick={() => addRecipients(c.id, { source: "leads" })} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                          + Leads
                        </button>
                        <button type="button" disabled={busy} onClick={() => setPasteFor(c.id)} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                          + Emails
                        </button>
                        <button type="button" disabled={busy} onClick={() => send(c.id)} className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          Send
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(c.id)} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Metric label="Recipients" value={String(c.recipientCount)} />
                  <Metric label="Opens" value={String(c.opens)} />
                  <Metric label="Open rate" value={openRate === null ? "—" : `${openRate}%`} />
                  <Metric label="Clicks" value={String(c.clicks)} />
                  <Metric label="Unsubs" value={String(c.unsubscribes)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={pasteFor !== null} title="Add email addresses" onClose={() => setPasteFor(null)}>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-muted">
            One address per line, or separated by commas
            <textarea
              rows={5}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-muted">Only add people who agreed to get email from you.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPasteFor(null)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold">
              Cancel
            </button>
            <button type="button" onClick={addPasted} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white">
              Add
            </button>
          </div>
        </div>
      </Modal>

      <NewCampaignModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-background/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function NewCampaignModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", subject: "", body: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.subject.trim() || !f.body.trim()) {
      return toast.error("Name, subject, and body are required.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/email-campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name.trim(),
          subject: f.subject.trim(),
          body: f.body,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Campaign drafted.");
      setF({ name: "", subject: "", body: "" });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="New email campaign" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs font-semibold text-muted">
          Campaign name
          <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Subject line
          <input value={f.subject} onChange={(e) => setF((p) => ({ ...p, subject: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Body
          <textarea
            rows={6}
            value={f.body}
            onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))}
            className={input}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Create draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
