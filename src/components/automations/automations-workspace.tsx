"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type AutomationRow = {
  id: string;
  name: string;
  trigger: string;
  status: string;
  lastRun: string | null;
  successCount: number;
  failureCount: number;
  errorMessage: string | null;
  connectedTools: string[];
};

const variant = (status: string) => {
  if (status === "healthy") return "success" as const;
  if (status === "warning") return "warning" as const;
  if (status === "degraded") return "danger" as const;
  return "neutral" as const;
};

export function AutomationsWorkspace({ initial }: { initial: AutomationRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<AutomationRow | null>(null);
  const [del, setDel] = useState<AutomationRow | null>(null);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
        >
          Add automation
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((log) => (
          <div key={log.id} className="rounded-xl border border-card-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{log.name}</div>
                <div className="mt-1 text-xs text-muted">{log.trigger}</div>
              </div>
              <StatusBadge label={log.status} variant={variant(log.status)} />
            </div>
            <div className="mt-3 text-xs text-muted">
              Success {log.successCount} · Failures {log.failureCount}
            </div>
            <div className="mt-2 text-xs text-muted">
              Tools: {(log.connectedTools ?? []).join(", ") || "—"}
            </div>
            {log.errorMessage ? (
              <div className="mt-3 rounded-lg border border-valiant/25 bg-valiant-soft p-2 text-[11px] text-muted">
                {log.errorMessage}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEdit(log)}
                className="rounded-md border border-card-border px-2 py-1 text-[11px] font-semibold"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDel(log)}
                className="rounded-md border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <AutomationFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        onSaved={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

      {edit ? (
        <AutomationFormModal
          open
          onClose={() => setEdit(null)}
          mode="edit"
          id={edit.id}
          initial={{
            name: edit.name,
            trigger: edit.trigger,
            status: edit.status,
            successCount: edit.successCount,
            failureCount: edit.failureCount,
            errorMessage: edit.errorMessage ?? "",
            connectedTools: (edit.connectedTools ?? []).join(", "),
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
        title="Delete this automation log?"
        description={del?.name}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!del) return;
          const res = await fetch(`/api/automations/${del.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok) {
            toast.error(await errorMessageFromResponse(res));
            throw new Error("failed");
          }
          toast.success("Automation removed.");
          setItems((prev) => prev.filter((x) => x.id !== del.id));
          router.refresh();
        }}
      />
    </>
  );
}

function AutomationFormModal({
  open,
  onClose,
  mode,
  id,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  id?: string;
  initial?: {
    name: string;
    trigger: string;
    status: string;
    successCount: number;
    failureCount: number;
    errorMessage: string;
    connectedTools: string;
  };
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [status, setStatus] = useState("healthy");
  const [successCount, setSuccessCount] = useState("0");
  const [failureCount, setFailureCount] = useState("0");
  const [errorMessage, setErrorMessage] = useState("");
  const [connectedTools, setConnectedTools] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setTrigger(initial?.trigger ?? "");
    setStatus(initial?.status ?? "healthy");
    setSuccessCount(String(initial?.successCount ?? 0));
    setFailureCount(String(initial?.failureCount ?? 0));
    setErrorMessage(initial?.errorMessage ?? "");
    setConnectedTools(initial?.connectedTools ?? "");
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !trigger.trim() || !status.trim()) {
      toast.error("Name, trigger, and status are required.");
      return;
    }
    const sc = Number(successCount);
    const fc = Number(failureCount);
    if (Number.isNaN(sc) || Number.isNaN(fc)) {
      toast.error("Counts must be numbers.");
      return;
    }
    setBusy(true);
    try {
      const tools = connectedTools
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body =
        mode === "create"
          ? {
              name: name.trim(),
              trigger: trigger.trim(),
              status: status.trim(),
              successCount: sc,
              failureCount: fc,
              errorMessage: errorMessage.trim() || null,
              connectedTools: tools,
            }
          : {
              name: name.trim(),
              trigger: trigger.trim(),
              status: status.trim(),
              successCount: sc,
              failureCount: fc,
              errorMessage: errorMessage.trim() || null,
              connectedTools: tools,
            };
      const url = mode === "create" ? "/api/automations" : `/api/automations/${id}`;
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
      toast.success(mode === "create" ? "Automation created." : "Automation updated.");
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Add automation" : "Edit automation"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="text-xs font-semibold text-muted">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Trigger
          <input
            required
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Status (healthy / warning / degraded / …)
          <input
            required
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Success count
            <input
              value={successCount}
              onChange={(e) => setSuccessCount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Failure count
            <input
              value={failureCount}
              onChange={(e) => setFailureCount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="text-xs font-semibold text-muted">
          Connected tools (comma-separated)
          <input
            value={connectedTools}
            onChange={(e) => setConnectedTools(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Error message (optional)
          <textarea
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
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
