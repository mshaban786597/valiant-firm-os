"use client";

import { TaskStatus } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type DeliveryTask = {
  id: string;
  title: string;
  clientName: string;
  status: TaskStatus;
  priority: string;
  dueDate: string | null;
};

const COLS: TaskStatus[] = [
  TaskStatus.Backlog,
  TaskStatus.InProgress,
  TaskStatus.QA,
  TaskStatus.Blocked,
  TaskStatus.Completed,
];

export function TaskBoard({ tasks }: { tasks: DeliveryTask[] }) {
  const router = useRouter();
  const toast = useToast();
  const [local, setLocal] = useState(tasks);
  const [delId, setDelId] = useState<string | null>(null);

  useEffect(() => {
    setLocal(tasks);
  }, [tasks]);

  const grouped = new Map<TaskStatus, DeliveryTask[]>();
  for (const c of COLS) grouped.set(c, []);
  for (const t of local) {
    grouped.get(t.status)?.push(t);
  }

  async function move(id: string, status: TaskStatus) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error(await errorMessageFromResponse(res));
      return;
    }
    const json = (await res.json()) as { task: { id: string; status: TaskStatus } };
    toast.success("Task updated.");
    setLocal((prev) =>
      prev.map((t) => (t.id === json.task.id ? { ...t, status: json.task.status } : t)),
    );
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await errorMessageFromResponse(res));
      throw new Error("delete failed");
    }
    toast.success("Task deleted.");
    setLocal((prev) => prev.filter((t) => t.id !== id));
    router.refresh();
  }

  const delTitle = local.find((t) => t.id === delId)?.title;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-5">
        {COLS.map((col) => (
          <div key={col} className="rounded-xl border border-card-border bg-card/60 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {col}
            </div>
            <div className="space-y-2">
              {(grouped.get(col) ?? []).map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-card-border bg-background/40 p-3 text-xs shadow-sm"
                >
                  <div className="font-semibold text-foreground">{task.title}</div>
                  <div className="mt-1 text-muted">{task.clientName}</div>
                  <div className="mt-1 text-muted">
                    Priority {task.priority}
                    {task.dueDate ? ` · Due ${new Date(task.dueDate).toLocaleDateString()}` : ""}
                  </div>
                  <label className="mt-2 block text-[11px] font-semibold text-muted">
                    Status
                    <select
                      className="mt-1 w-full rounded-md border border-card-border bg-card px-2 py-1 text-xs text-foreground"
                      value={task.status}
                      onChange={(e) => move(task.id, e.target.value as TaskStatus)}
                    >
                      {COLS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setDelId(task.id)}
                    className="mt-2 w-full rounded-md border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-100"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        title="Delete this task?"
        description={delTitle}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!delId) return;
          await remove(delId);
        }}
      />
    </>
  );
}
