"use client";

import { useMemo, useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

type Item = {
  id: string;
  label: string;
  completed: boolean;
};

export function OnboardingChecklist({ items }: { items: Item[] }) {
  const toast = useToast();
  const [local, setLocal] = useState(items);

  useEffect(() => {
    setLocal(items);
  }, [items]);

  const pct = useMemo(() => {
    if (!local.length) return 0;
    const done = local.filter((i) => i.completed).length;
    return Math.round((done / local.length) * 100);
  }, [local]);

  async function toggle(id: string, completed: boolean) {
    const res = await fetch(`/api/onboarding-items/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (!res.ok) {
      toast.error(await errorMessageFromResponse(res));
      return;
    }
    setLocal((prev) =>
      prev.map((row) => (row.id === id ? { ...row, completed } : row)),
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Onboarding checklist
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            Progress · {pct}%
          </div>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-card-border">
          <div
            className="h-full rounded-full bg-valiant transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {local.map((row) => (
          <label
            key={row.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-card-border bg-background/40 px-3 py-2 text-sm hover:border-valiant/30"
          >
            <input
              type="checkbox"
              checked={row.completed}
              onChange={(e) => toggle(row.id, e.target.checked)}
              className="mt-1"
            />
            <span className={row.completed ? "text-muted line-through" : ""}>
              {row.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
