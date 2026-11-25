"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

/**
 * Marks whether a client, contact or lead agreed to marketing email. Only
 * people with this mark can be added to an email campaign.
 */
export function EmailConsentToggle({
  kind,
  id,
  agreed,
  hasEmail,
}: {
  kind: "client" | "contact" | "lead";
  id: string;
  agreed: boolean;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/email-consent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, agreed: !agreed }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success(agreed ? "Marked as not agreed. They will not be added to campaigns." : "Marked as agreed to marketing email.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!hasEmail) return <span className="text-xs text-muted">No email address</span>;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={agreed}
      disabled={busy}
      onClick={toggle}
      title="Only people who agreed can be added to an email campaign"
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
        agreed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-card-border text-muted"
      }`}
    >
      {agreed ? "Agreed ✓" : "Not agreed"}
    </button>
  );
}
