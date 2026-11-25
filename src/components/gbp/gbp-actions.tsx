"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

async function send(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Look for Business Profiles the Google credential manages and register new ones. */
export function FindProfilesButton() {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("integration.write");
  const [busy, setBusy] = useState(false);
  if (!canWrite) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await send("/api/gbp/discover", "POST");
          if (!res.ok) return toast.error(await errorMessageFromResponse(res));
          toast.success(((await res.json()) as { message: string }).message);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
    >
      {busy ? "Looking…" : "Find profiles"}
    </button>
  );
}

/** Pull the latest 28 days for one profile now. */
export function SyncProfileButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("integration.write");
  const [busy, setBusy] = useState(false);
  if (!canWrite) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await send(`/api/gbp/${id}`, "PATCH", { action: "refresh" });
          if (!res.ok) return toast.error(await errorMessageFromResponse(res));
          toast.success(((await res.json()) as { message: string }).message);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
    >
      {busy ? "Syncing…" : "Sync now"}
    </button>
  );
}
