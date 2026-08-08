"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  clientName: string | null;
  tags: string[];
};

type ClientOption = { id: string; businessName: string };

export function ContactsWorkspace({
  contacts,
  clients,
}: {
  contacts: ContactRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("contact.write");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Contact removed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
          >
            Add contact
          </button>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Add the people you work with at each client account."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Tags</th>
                {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted">{c.title ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-background/60 px-1.5 py-0.5 text-[11px] text-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => remove(c.id)}
                        className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddContactModal
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function AddContactModal({
  open,
  onClose,
  clients,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    role: "",
    clientId: "",
    tags: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name.trim(),
          email: f.email.trim() || null,
          phone: f.phone.trim() || null,
          title: f.title.trim() || null,
          role: f.role.trim() || null,
          clientId: f.clientId || null,
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success("Contact added.");
      setF({ name: "", email: "", phone: "", title: "", role: "", clientId: "", tags: "" });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

  return (
    <Modal open={open} title="Add contact" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Name
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Title
            <input value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Email
            <input value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Phone
            <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} className={input} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Client
            <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={input}>
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.businessName}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Tags (comma-separated)
            <input value={f.tags} onChange={(e) => setF((p) => ({ ...p, tags: e.target.value }))} className={input} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
