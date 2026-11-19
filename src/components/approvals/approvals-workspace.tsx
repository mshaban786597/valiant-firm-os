"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type ApprovalRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  outcome: string | null;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  executionStatus: string;
  verificationStatus: string;
};

type LeadOption = { id: string; businessName: string; hasEmail: boolean };

const KIND_LABEL: Record<string, string> = {
  outreach_email: "Outreach email",
  fix: "Website fix",
  content: "Content update",
  ads_change: "Ad change",
  custom: "Other",
};

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

export function ApprovalsWorkspace({
  pending,
  history,
  leads,
}: {
  pending: ApprovalRow[];
  history: ApprovalRow[];
  leads: LeadOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const can = useCan();
  const canDecide = can("approval.decide");
  const canRequest = can("approval.request");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  async function stage(id: string, stageName: "execute" | "verify" | "rollback") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/approvals/${id}/stage`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: stageName }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { message: string };
      toast.success(data.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { approval: { outcome: string | null } };
      toast.success(data.approval.outcome ?? (decision === "APPROVED" ? "Approved." : "Rejected."));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Waiting for review</h2>
          {canRequest ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRequestOpen(true)}
                className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold"
              >
                New request
              </button>
              <button
                type="button"
                onClick={() => setDraftOpen(true)}
                className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white"
              >
                Draft outreach email
              </button>
            </div>
          ) : null}
        </div>
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting for review"
            description="Outreach emails and proposed changes appear here. Nothing is sent or changed until you approve it."
          />
        ) : (
          <div className="space-y-3">
            {pending.map((a) => (
              <div key={a.id} className="rounded-xl border border-card-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-muted">
                      {KIND_LABEL[a.kind] ?? a.kind} · {new Date(a.createdAt).toLocaleString()}
                      {a.expiresAt ? ` · approval valid until ${new Date(a.expiresAt).toLocaleString()}` : ""}
                    </div>
                  </div>
                  {canDecide ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, "REJECTED")}
                        className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, "APPROVED")}
                        className="rounded-lg bg-valiant px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {a.kind === "outreach_email" ? "Approve & send" : "Approve"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs">
                  {a.body}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Decided</h2>
        {history.length === 0 ? (
          <EmptyState title="No decisions yet" description="Approved and rejected requests are kept here." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">What happened</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id} className="border-t border-card-border">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{a.title}</div>
                      <div className="text-xs text-muted">{KIND_LABEL[a.kind] ?? a.kind}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={a.status === "APPROVED" ? "Approved" : "Rejected"}
                        variant={a.status === "APPROVED" ? "success" : "neutral"}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      <div>{a.outcome ?? "—"}</div>
                      {a.kind === "fix" && a.status === "APPROVED" ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge
                              label={`Execution: ${a.executionStatus.replace(/_/g, " ")}`}
                              variant={a.executionStatus === "executed" ? "success" : a.executionStatus === "failed" ? "danger" : "neutral"}
                            />
                            <StatusBadge
                              label={`Verification: ${a.verificationStatus}`}
                              variant={a.verificationStatus === "passed" ? "success" : a.verificationStatus === "failed" ? "danger" : "neutral"}
                            />
                          </div>
                          {canDecide ? (
                            <div className="flex flex-wrap gap-2">
                              {a.executionStatus !== "executed" ? (
                                <button type="button" disabled={busyId === a.id} onClick={() => stage(a.id, "execute")} className="rounded-lg bg-valiant px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">Mark executed</button>
                              ) : (
                                <>
                                  <button type="button" disabled={busyId === a.id} onClick={() => stage(a.id, "verify")} className="rounded-lg bg-valiant px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">Verify (re-run check)</button>
                                  <button type="button" disabled={busyId === a.id} onClick={() => stage(a.id, "rollback")} className="rounded-lg border border-card-border px-2.5 py-1 text-xs font-semibold disabled:opacity-50">Roll back</button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {a.decidedAt ? new Date(a.decidedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DraftOutreachModal
        open={draftOpen}
        leads={leads}
        onClose={() => setDraftOpen(false)}
        onDone={() => {
          setDraftOpen(false);
          router.refresh();
        }}
      />
      <NewRequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onDone={() => {
          setRequestOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function DraftOutreachModal({
  open,
  leads,
  onClose,
  onDone,
}: {
  open: boolean;
  leads: LeadOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) return toast.error("Choose a lead.");
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/outreach-draft`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Draft added to the review queue.");
      setLeadId("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Draft outreach email" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted">
          Writes an email from what is stored on the lead and puts it in the review queue. Nothing is
          sent until it is approved.
        </p>
        {leads.length === 0 ? (
          <p className="text-sm">Add a lead first.</p>
        ) : (
          <label className="block text-xs font-semibold text-muted">
            Lead
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={input}>
              <option value="">— Choose a lead —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.businessName}
                  {l.hasEmail ? "" : " (no email)"}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
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
            disabled={busy || leads.length === 0}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Drafting…" : "Create draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewRequestModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ kind: "fix", title: "", body: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.body.trim()) return toast.error("Add a title and the details.");
    setBusy(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: f.kind, title: f.title.trim(), body: f.body.trim() }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Request added to the review queue.");
      setF({ kind: "fix", title: "", body: "" });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="New review request" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs font-semibold text-muted">
          Type
          <select value={f.kind} onChange={(e) => setF((p) => ({ ...p, kind: e.target.value }))} className={input}>
            <option value="fix">Website fix</option>
            <option value="content">Content update</option>
            <option value="ads_change">Ad change</option>
            <option value="custom">Other</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-muted">
          Title
          <input value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Details
          <textarea
            rows={5}
            value={f.body}
            onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))}
            className={input}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
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
            {busy ? "Sending…" : "Send for review"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
