"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export function LeadsImportExport() {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("lead.write");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const csv = await file.text();
      const res = await fetch("/api/leads/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      const data = (await res.json()) as {
        imported: number;
        skippedDuplicates: number;
      };
      toast.success(
        `Imported ${data.imported} leads (${data.skippedDuplicates} duplicates skipped).`,
      );
      router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="/api/leads/export"
        className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold hover:bg-card"
      >
        Export CSV
      </a>
      {canWrite ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold hover:bg-card disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import CSV"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </>
      ) : null}
    </div>
  );
}
