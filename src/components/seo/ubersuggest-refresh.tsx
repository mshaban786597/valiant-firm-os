"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";

/** Pull a fresh Ubersuggest snapshot for each of our websites, one at a time. */
export function UbersuggestRefreshButton({ domains, connected }: { domains: string[]; connected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("integration.write");
  const [progress, setProgress] = useState<string | null>(null);
  if (!canWrite) return null;
  if (!connected) {
    return (
      <a href="/integrations" className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold">
        Connect Ubersuggest to refresh
      </a>
    );
  }

  async function run() {
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i]!;
      setProgress(`${i + 1} of ${domains.length}: ${domain}`);
      try {
        const res = await fetch("/api/integrations/ubersuggest", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh", domain }),
        });
        if (res.ok) ok += 1;
        else {
          failed.push(domain);
          // A lost sign-in fails for every site: stop instead of repeating it.
          if (res.status === 409) break;
        }
      } catch {
        failed.push(domain);
      }
    }
    setProgress(null);
    if (ok) toast.success(`${ok} website${ok === 1 ? "" : "s"} refreshed from Ubersuggest.`);
    if (failed.length) toast.error(`Could not refresh: ${failed.join(", ")}.`);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={progress !== null || domains.length === 0}
      onClick={run}
      className="rounded-lg bg-valiant px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
    >
      {progress ? `Refreshing ${progress}` : `Refresh ${domains.length} website${domains.length === 1 ? "" : "s"} from Ubersuggest`}
    </button>
  );
}
