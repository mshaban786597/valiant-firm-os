"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/site-leads/status";

async function send(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Change where an enquiry stands. */
export function LeadStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("lead.write");
  const [busy, setBusy] = useState(false);
  if (!canWrite) return <span className="text-xs">{LEAD_STATUS_LABEL[status as keyof typeof LEAD_STATUS_LABEL] ?? status}</span>;
  return (
    <select
      value={status}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        try {
          const res = await send(`/api/site-leads/${id}`, "PATCH", { status: e.target.value });
          if (!res.ok) return toast.error(await errorMessageFromResponse(res));
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg border border-card-border bg-background px-2 py-1 text-xs disabled:opacity-50"
      aria-label="Status"
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {LEAD_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

/** Remove one enquiry for good. */
export function DeleteLeadButton({ id, isTest }: { id: string; isTest: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const canDelete = useCan()("lead.delete");
  const [busy, setBusy] = useState(false);
  if (!canDelete) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(isTest ? "Delete this test enquiry?" : "Delete this enquiry for good? This cannot be undone.")) return;
        setBusy(true);
        try {
          const res = await send(`/api/site-leads/${id}`, "DELETE");
          if (!res.ok) return toast.error(await errorMessageFromResponse(res));
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs text-muted hover:text-red-600 disabled:opacity-50"
    >
      Delete
    </button>
  );
}

export type IntakeSite = {
  id: string;
  domain: string;
  ownership: string;
  intakeUrl: string | null;
  received: number;
  lastReceivedAt: string | null;
};

/** Per-website intake: switch on, copy the address, send a test, replace or switch off. */
export function IntakePanel({ sites }: { sites: IntakeSite[] }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("client.write");
  const [busy, setBusy] = useState<string | null>(null);

  async function act(siteId: string, action: "enable" | "rotate" | "disable" | "test") {
    if (action === "rotate" && !window.confirm("Create a new address? The website's form must be updated; the old address stops working.")) return;
    if (action === "disable" && !window.confirm("Switch lead intake off for this website? Its form will no longer reach the inbox.")) return;
    setBusy(`${siteId}:${action}`);
    try {
      const res = await send(`/api/sites/${siteId}/intake`, "POST", { action });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success(((await res.json()) as { message: string }).message);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40";
  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Website</th>
            <th className="px-4 py-3">Intake address</th>
            <th className="px-4 py-3">Received</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id} className="border-t border-card-border align-top">
              <td className="px-4 py-3">
                <div className="font-semibold">{s.domain}</div>
                <div className="text-xs text-muted">{s.ownership}</div>
              </td>
              <td className="px-4 py-3 text-xs">
                {s.intakeUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="max-w-[340px] truncate rounded bg-background px-2 py-1" title="Keep this address private">
                      {s.intakeUrl.replace(/([A-Za-z0-9_-]{6})[A-Za-z0-9_-]+$/, "$1…")}
                    </code>
                    <button
                      type="button"
                      className={btn}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(s.intakeUrl!);
                          toast.success("Address copied.");
                        } catch {
                          toast.error("Could not copy. Select the address and copy it by hand.");
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                ) : (
                  <span className="text-muted">Switched off</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {s.received > 0 ? (
                  <>
                    <div>{s.received} enquir{s.received === 1 ? "y" : "ies"}</div>
                    <div className="text-muted">Last {s.lastReceivedAt ? new Date(s.lastReceivedAt).toLocaleString() : "—"}</div>
                  </>
                ) : (
                  <span className="text-muted">{s.intakeUrl ? "Nothing received yet" : "—"}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                {canWrite ? (
                  <div className="flex justify-end gap-2">
                    {s.intakeUrl ? (
                      <>
                        <button type="button" className={btn} disabled={busy !== null} onClick={() => act(s.id, "test")}>
                          {busy === `${s.id}:test` ? "Sending…" : "Send test"}
                        </button>
                        <button type="button" className={btn} disabled={busy !== null} onClick={() => act(s.id, "rotate")}>
                          New address
                        </button>
                        <button type="button" className={`${btn} text-red-600`} disabled={busy !== null} onClick={() => act(s.id, "disable")}>
                          Switch off
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        disabled={busy !== null}
                        onClick={() => act(s.id, "enable")}
                      >
                        {busy === `${s.id}:enable` ? "Switching on…" : "Switch on"}
                      </button>
                    )}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
