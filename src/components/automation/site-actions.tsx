"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

type ClientOption = { id: string; businessName: string };

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

/** "Add website" → creates the full monitor suite for a URL. */
export function AddWebsiteButton({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("monitor.write");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ url: "", label: "", clientId: "" });

  if (!canWrite) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.url.trim()) return toast.error("Enter the website URL.");
    setBusy(true);
    try {
      const res = await fetch("/api/monitors/suite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: f.url.trim(),
          label: f.label.trim() || undefined,
          clientId: f.clientId || null,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { created: number };
      toast.success(
        data.created
          ? `Website added with ${data.created} checks. Run a full cycle to get the first results.`
          : "That website already has the full set of checks.",
      );
      setF({ url: "", label: "", clientId: "" });
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
        className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
      >
        Add website
      </button>
      <Modal open={open} title="Add website" onClose={() => !busy && setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted">
            Adds uptime, DNS, HTTPS, indexing, content change, broken link, security, mobile and
            page speed checks for this site.
          </p>
          <label className="block text-xs font-semibold text-muted">
            Website URL
            <input
              placeholder="https://example.com"
              value={f.url}
              onChange={(e) => setF((p) => ({ ...p, url: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Short name (optional)
            <input
              placeholder="PI — Polar Insulation"
              value={f.label}
              onChange={(e) => setF((p) => ({ ...p, label: e.target.value }))}
              className={input}
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Client (optional)
            <select
              value={f.clientId}
              onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))}
              className={input}
            >
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add website"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** "Run full cycle" → runs every automated check for the org now. */
export function RunAllButton({ label = "Run full cycle" }: { label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("monitor.write");
  const [busy, setBusy] = useState(false);

  if (!canWrite) return null;

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/monitors/run-all", { method: "POST", credentials: "include" });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const { summary } = (await res.json()) as {
        summary: { checked: number; ok: number; failed: number; unknown: number; opened: number; resolved: number };
      };
      if (summary.checked === 0) {
        toast.success("No automated checks to run yet. Add a website first.");
      } else {
        toast.success(
          `${summary.checked} checks run: ${summary.ok} passed, ${summary.failed} failed` +
            (summary.unknown ? `, ${summary.unknown} could not be measured` : "") +
            `. ${summary.opened} new issue(s), ${summary.resolved} resolved.`,
        );
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={run}
      className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
    >
      {busy ? "Running checks…" : label}
    </button>
  );
}
