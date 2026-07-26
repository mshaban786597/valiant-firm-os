"use client";

import { TaskPriority, TaskStatus } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export function TaskFormModal({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: { id: string; businessName: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [serviceType, setServiceType] = useState("Local SEO");
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.Medium);
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.Backlog);
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientId(clients[0]?.id ?? "");
    setTitle("");
    setServiceType("Local SEO");
    setPriority(TaskPriority.Medium);
    setStatus(TaskStatus.Backlog);
    setDueDate("");
    setDescription("");
  }, [open, clients]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Select a client.");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setBusy(true);
    try {
      const dueIso =
        dueDate.trim() === "" ? null : new Date(`${dueDate}T12:00:00.000Z`).toISOString();
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: title.trim(),
          description: description.trim() || null,
          serviceType: serviceType.trim(),
          priority,
          status,
          dueDate: dueIso,
        }),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success("Task created.");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add task" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <label className="text-xs font-semibold text-muted">
          Client
          <select
            required
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
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Service type
            <input
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Priority
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as TaskPriority)
              }
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              {Object.values(TaskPriority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Initial status
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as TaskStatus)
              }
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              {Object.values(TaskStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
            {busy ? "Saving…" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeliveryToolbar({
  clients,
}: {
  clients: { id: string; businessName: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (!clients.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
      >
        Add task
      </button>
      <TaskFormModal open={open} onClose={() => setOpen(false)} clients={clients} />
    </>
  );
}
