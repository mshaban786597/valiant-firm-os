"use client";

import { ReportStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type ReportRow = {
  id: string;
  month: string;
  clientId: string;
  clientName: string;
  organicSessions: number | null;
  organicLeads: number | null;
  status: ReportStatus;
};

const statusVariant = (status: ReportStatus) => {
  if (status === ReportStatus.Sent) return "success" as const;
  if (status === ReportStatus.QA) return "warning" as const;
  return "neutral" as const;
};

export function ReportsWorkspace({
  reports,
  clients,
}: {
  reports: ReportRow[];
  clients: { id: string; businessName: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(reports);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<ReportRow | null>(null);
  const [del, setDel] = useState<ReportRow | null>(null);

  useEffect(() => {
    setRows(reports);
  }, [reports]);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
        >
          New report
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Organic</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-card-border hover:bg-background/30">
                <td className="px-4 py-3 font-semibold">{r.month}</td>
                <td className="px-4 py-3 text-xs">
                  <Link className="hover:text-valiant" href={`/clients/${r.clientId}`}>
                    {r.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  Sessions {r.organicSessions ?? "—"} · Leads {r.organicLeads ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={r.status} variant={statusVariant(r.status)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEdit(r)}
                      className="rounded-md border border-card-border px-2 py-1 text-[11px] font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDel(r)}
                      className="rounded-md border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReportFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        clients={clients}
        onSaved={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

      {edit ? (
        <ReportFormModal
          open
          onClose={() => setEdit(null)}
          mode="edit"
          reportId={edit.id}
          clients={clients}
          initial={{
            clientId: edit.clientId,
            month: edit.month,
            status: edit.status,
            organicSessions: edit.organicSessions,
            organicLeads: edit.organicLeads,
          }}
          onSaved={() => {
            setEdit(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete this report?"
        description={del ? `${del.month} · ${del.clientName}` : undefined}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!del) return;
          const res = await fetch(`/api/reports/${del.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok) {
            toast.error(await errorMessageFromResponse(res));
            throw new Error("failed");
          }
          toast.success("Report deleted.");
          setRows((prev) => prev.filter((x) => x.id !== del.id));
          router.refresh();
        }}
      />
    </>
  );
}

function ReportFormModal({
  open,
  onClose,
  mode,
  reportId,
  clients,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  reportId?: string;
  clients: { id: string; businessName: string }[];
  initial?: {
    clientId: string;
    month: string;
    status: ReportStatus;
    organicSessions: number | null;
    organicLeads: number | null;
  };
  onSaved: () => void;
}) {
  const toast = useToast();
  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState<ReportStatus>(ReportStatus.Draft);
  const [organicSessions, setOrganicSessions] = useState("");
  const [organicLeads, setOrganicLeads] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientId(initial?.clientId ?? clients[0]?.id ?? "");
    setMonth(initial?.month ?? "");
    setStatus(initial?.status ?? ReportStatus.Draft);
    setOrganicSessions(
      initial?.organicSessions != null ? String(initial.organicSessions) : "",
    );
    setOrganicLeads(
      initial?.organicLeads != null ? String(initial.organicLeads) : "",
    );
  }, [open, initial, clients]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !month.trim()) {
      toast.error("Client and month are required.");
      return;
    }
    setBusy(true);
    try {
      const os =
        organicSessions.trim() === "" ? null : Number(organicSessions);
      const ol = organicLeads.trim() === "" ? null : Number(organicLeads);
      if (organicSessions.trim() !== "" && Number.isNaN(os)) {
        toast.error("Sessions must be a number.");
        return;
      }
      if (organicLeads.trim() !== "" && Number.isNaN(ol)) {
        toast.error("Leads must be a number.");
        return;
      }
      const body = {
        clientId,
        month: month.trim(),
        status,
        organicSessions: os,
        organicLeads: ol,
      };
      const url = mode === "create" ? "/api/reports" : `/api/reports/${reportId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success(mode === "create" ? "Report created." : "Report updated.");
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "create" ? "New report" : "Edit report"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="text-xs font-semibold text-muted">
          Client
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Month (YYYY-MM)
          <input
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="2026-05"
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Status
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ReportStatus)
            }
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          >
            {Object.values(ReportStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Organic sessions
            <input
              value={organicSessions}
              onChange={(e) => setOrganicSessions(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Organic leads
            <input
              value={organicLeads}
              onChange={(e) => setOrganicLeads(e.target.value)}
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
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
