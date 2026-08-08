"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeadStatus } from "@prisma/client";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { TRIGGERS } from "@/lib/automations/types";

export type WorkflowRow = {
  id: string;
  name: string;
  trigger: string;
  actionCount: number;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
};

const ACTION_TYPES = [
  { value: "create_task", label: "Create task" },
  { value: "create_alert", label: "Create alert" },
  { value: "update_lead_status", label: "Update lead status" },
  { value: "draft_email_campaign", label: "Draft email campaign" },
  { value: "log", label: "Log message" },
  { value: "webhook_post", label: "POST to webhook" },
] as const;

type DraftAction = {
  type: (typeof ACTION_TYPES)[number]["value"];
  title: string;
  message: string;
  status: LeadStatus;
  name: string;
  subject: string;
  body: string;
  url: string;
  severity: "info" | "warning" | "critical";
};

const emptyAction: DraftAction = {
  type: "log",
  title: "",
  message: "",
  status: LeadStatus.OutreachQueue,
  name: "",
  subject: "",
  body: "",
  url: "",
  severity: "info",
};

function buildActionConfig(a: DraftAction) {
  switch (a.type) {
    case "create_task":
      return { type: a.type, config: { title: a.title } };
    case "create_alert":
      return { type: a.type, config: { title: a.title, severity: a.severity } };
    case "update_lead_status":
      return { type: a.type, config: { status: a.status } };
    case "draft_email_campaign":
      return { type: a.type, config: { name: a.name, subject: a.subject, body: a.body } };
    case "log":
      return { type: a.type, config: { message: a.message } };
    case "webhook_post":
      return { type: a.type, config: { url: a.url } };
  }
}

const triggerLabel = (v: string) => TRIGGERS.find((t) => t.value === v)?.label ?? v;

export function WorkflowsWorkspace({ workflows }: { workflows: WorkflowRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, method: "PATCH" | "DELETE" | "RUN", body?: unknown) {
    setBusyId(id);
    try {
      const url = method === "RUN" ? `/api/workflows/${id}/run` : `/api/workflows/${id}`;
      const res = await fetch(url, {
        method: method === "RUN" ? "POST" : method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      if (method === "RUN") {
        const data = (await res.json()) as { result: { ok: boolean; error?: string } };
        toast[data.result.ok ? "success" : "error"](
          data.result.ok ? "Workflow ran successfully." : `Run failed: ${data.result.error}`,
        );
      } else {
        toast.success("Updated.");
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Workflows</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
        >
          New workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          description="Build a trigger → action workflow (e.g. when a deal is won, create an onboarding task)."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Actions</th>
                <th className="px-4 py-3">Runs</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3 font-semibold">{w.name}</td>
                  <td className="px-4 py-3 text-muted">{triggerLabel(w.trigger)}</td>
                  <td className="px-4 py-3">{w.actionCount}</td>
                  <td className="px-4 py-3">{w.runCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={w.enabled ? "Enabled" : "Disabled"}
                      variant={w.enabled ? "success" : "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={busyId === w.id} onClick={() => act(w.id, "RUN")} className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                        Run
                      </button>
                      <button type="button" disabled={busyId === w.id} onClick={() => act(w.id, "PATCH", { enabled: !w.enabled })} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                        {w.enabled ? "Disable" : "Enable"}
                      </button>
                      <button type="button" disabled={busyId === w.id} onClick={() => act(w.id, "DELETE")} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewWorkflowModal
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

function NewWorkflowModal({
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
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0].value);
  const [actions, setActions] = useState<DraftAction[]>([{ ...emptyAction }]);

  function updateAction(i: number, patch: Partial<DraftAction>) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Workflow name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trigger,
          actions: actions.map(buildActionConfig),
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Workflow created.");
      setName("");
      setActions([{ ...emptyAction }]);
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="New workflow" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            When (trigger)
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)} className={input}>
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">Then (actions)</div>
          {actions.map((a, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-card-border bg-background/40 p-2">
              <div className="flex items-center gap-2">
                <select
                  value={a.type}
                  onChange={(e) => updateAction(i, { type: e.target.value as DraftAction["type"] })}
                  className="flex-1 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
                >
                  {ACTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Remove action"
                  onClick={() => setActions((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))}
                  className="rounded-lg border border-card-border px-2 py-1.5 text-xs text-muted"
                >
                  ✕
                </button>
              </div>
              {(a.type === "create_task" || a.type === "create_alert") && (
                <input placeholder="Title" value={a.title} onChange={(e) => updateAction(i, { title: e.target.value })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" />
              )}
              {a.type === "create_alert" && (
                <select value={a.severity} onChange={(e) => updateAction(i, { severity: e.target.value as DraftAction["severity"] })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm">
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                  <option value="critical">critical</option>
                </select>
              )}
              {a.type === "update_lead_status" && (
                <select value={a.status} onChange={(e) => updateAction(i, { status: e.target.value as LeadStatus })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm">
                  {Object.values(LeadStatus).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              {a.type === "draft_email_campaign" && (
                <div className="space-y-2">
                  <input placeholder="Campaign name" value={a.name} onChange={(e) => updateAction(i, { name: e.target.value })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" />
                  <input placeholder="Subject" value={a.subject} onChange={(e) => updateAction(i, { subject: e.target.value })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" />
                  <textarea placeholder="Body" rows={2} value={a.body} onChange={(e) => updateAction(i, { body: e.target.value })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" />
                </div>
              )}
              {a.type === "log" && (
                <input placeholder="Message" value={a.message} onChange={(e) => updateAction(i, { message: e.target.value })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" />
              )}
              {a.type === "webhook_post" && (
                <input placeholder="https://…" value={a.url} onChange={(e) => updateAction(i, { url: e.target.value })} className="w-full rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setActions((prev) => [...prev, { ...emptyAction }])}
            className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold"
          >
            + Add action
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
