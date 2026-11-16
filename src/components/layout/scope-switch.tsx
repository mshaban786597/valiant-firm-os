"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const COOKIE = "vf_scope";

function readScope(): "live" | "demo" {
  if (typeof document === "undefined") return "live";
  const m = document.cookie.match(/(?:^|;\s*)vf_scope=([^;]+)/);
  return m && m[1] === "demo" ? "demo" : "live";
}

/**
 * Live / Demo data switch. Demo holds the labeled pilot fixtures; live totals
 * never include them. The choice is a cookie so server pages render the scope.
 */
export function ScopeSwitch() {
  const router = useRouter();
  const [scope, setScope] = useState<"live" | "demo">("live");

  useEffect(() => {
    setScope(readScope());
  }, []);

  function choose(next: "live" | "demo") {
    if (next === scope) return;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setScope(next);
    router.refresh();
  }

  const base = "px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-valiant/50";
  return (
    <div
      role="group"
      aria-label="Data scope"
      className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-card-border bg-card"
    >
      <button
        type="button"
        aria-pressed={scope === "live"}
        onClick={() => choose("live")}
        className={`${base} ${scope === "live" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "text-muted hover:text-foreground"}`}
      >
        Live
      </button>
      <button
        type="button"
        aria-pressed={scope === "demo"}
        onClick={() => choose("demo")}
        className={`${base} ${scope === "demo" ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "text-muted hover:text-foreground"}`}
      >
        Demo
      </button>
    </div>
  );
}
