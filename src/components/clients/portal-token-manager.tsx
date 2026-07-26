"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export function PortalTokenManager({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-auth`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 30 }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { portalPath: string };
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${data.portalPath}`
          : data.portalPath;
      setLink(url);
      toast.success("Shareable portal link generated (valid 30 days).");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Share with client</h3>
          <p className="text-xs text-muted">
            Generate a read-only link the client can open without an account.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={generate}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate link"}
        </button>
      </div>
      {link ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold"
          >
            Copy
          </button>
        </div>
      ) : null}
    </div>
  );
}
