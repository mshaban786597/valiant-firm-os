"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export type TargetRow = {
  id: string;
  niche: string;
  keyword: string;
  city: string;
  state: string;
  active: boolean;
  lastRunAt: string | null;
  lastRun: { status: string; resultsSeen: number; added: number; provider: string; error: string | null } | null;
};

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";
const empty = { niche: "", keyword: "", city: "", state: "" };

/** Saved searches the prospecting agent repeats, with run / pause / remove. */
export function ProspectingPanel({ targets, providerConnected }: { targets: TargetRow[]; providerConnected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("lead.write");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState(empty);

  async function call(key: string, url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return false;
      }
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (data.message) toast.success(data.message);
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.niche.trim() || !f.keyword.trim() || !f.city.trim() || !f.state.trim()) {
      return toast.error("Fill in the niche, the search phrase, the city and the state.");
    }
    if (await call("add", "/api/prospecting/targets", "POST", f)) {
      setF(empty);
      setOpen(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Prospecting agent</h2>
        {canWrite ? (
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold">
            Add a search
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        For each saved search the agent keeps businesses ranking on Google pages 2 to 5, reads their own website for
        a published contact email and real findings, and writes a separate email for each. Drafts wait in Review &amp;
        Approvals. {providerConnected
          ? "Search provider connected: the agent runs one search a day on its own."
          : "No search provider is connected, so the agent cannot search by itself yet; results are imported instead."}
      </p>

      {targets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-card-border bg-card p-6 text-center text-sm text-muted">
          No searches saved. Add one, for example niche “Gutters”, search “gutter installation”, city “Tallahassee”, state “FL”.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Search</th>
                <th className="px-4 py-3">Niche</th>
                <th className="px-4 py-3">Last run</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id} className="border-t border-card-border">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{t.keyword}</div>
                    <div className="text-xs text-muted">
                      {t.city}, {t.state}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{t.niche}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                    {t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : "Never run"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {t.lastRun ? (
                      t.lastRun.status === "ok" ? (
                        `${t.lastRun.resultsSeen} results checked, ${t.lastRun.added} added`
                      ) : (
                        <span className="text-red-600 dark:text-red-400">{t.lastRun.error ?? t.lastRun.status}</span>
                      )
                    ) : (
                      "—"
                    )}
                    {!t.active ? (
                      <div className="mt-1">
                        <StatusBadge label="Paused" variant="neutral" />
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy !== null || !providerConnected}
                          title={providerConnected ? "Run this search now" : "Connect a search provider to run searches from here"}
                          onClick={() => call(`run:${t.id}`, "/api/prospecting/run", "POST", { targetId: t.id })}
                          className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {busy === `run:${t.id}` ? "Searching…" : "Run now"}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => call(`toggle:${t.id}`, `/api/prospecting/targets/${t.id}`, "PATCH", { active: !t.active })}
                          className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
                        >
                          {t.active ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            if (window.confirm("Remove this search? Prospects it already found are kept.")) {
                              void call(`del:${t.id}`, `/api/prospecting/targets/${t.id}`, "DELETE");
                            }
                          }}
                          className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} title="Add a search" onClose={() => busy === null && setOpen(false)}>
        <form onSubmit={add} className="space-y-3">
          <p className="text-xs text-muted">
            Use the phrase a customer would type into Google. The agent searches it in the city you give.
          </p>
          <label className="block text-xs font-semibold text-muted">
            Niche
            <input value={f.niche} onChange={(e) => setF((p) => ({ ...p, niche: e.target.value }))} placeholder="Gutters" className={input} />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Search phrase
            <input value={f.keyword} onChange={(e) => setF((p) => ({ ...p, keyword: e.target.value }))} placeholder="gutter installation" className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-muted">
              City
              <input value={f.city} onChange={(e) => setF((p) => ({ ...p, city: e.target.value }))} placeholder="Tallahassee" className={input} />
            </label>
            <label className="block text-xs font-semibold text-muted">
              State
              <input value={f.state} onChange={(e) => setF((p) => ({ ...p, state: e.target.value }))} placeholder="FL" className={input} />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={busy !== null} onClick={() => setOpen(false)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy !== null} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy === "add" ? "Saving…" : "Save search"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
