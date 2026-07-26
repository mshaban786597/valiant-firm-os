"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export function SettingsWorkspace({
  organizationName,
  organizationSlug,
  role,
  accentHex,
}: {
  organizationName: string;
  organizationSlug: string;
  role: string | null | undefined;
  accentHex: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(organizationName);
  const [accent, setAccent] = useState(accentHex);
  const [busyOrg, setBusyOrg] = useState(false);
  const [busyAccent, setBusyAccent] = useState(false);

  useEffect(() => {
    setName(organizationName);
  }, [organizationName]);

  useEffect(() => {
    setAccent(accentHex);
  }, [accentHex]);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Organization name is required.");
      return;
    }
    setBusyOrg(true);
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success("Organization updated.");
      router.refresh();
    } finally {
      setBusyOrg(false);
    }
  }

  async function saveAccent(e: React.FormEvent) {
    e.preventDefault();
    if (!/^#[0-9A-Fa-f]{6}$/.test(accent.trim())) {
      toast.error("Accent must be a hex color like #D30404.");
      return;
    }
    setBusyAccent(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "brand.accent", value: accent.trim() }),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success("Brand accent saved.");
      router.refresh();
    } finally {
      setBusyAccent(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        onSubmit={saveOrg}
        className="rounded-xl border border-card-border bg-card p-4 space-y-3"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Organization
        </div>
        <label className="text-xs font-semibold text-muted">
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="text-xs text-muted">
          Slug · <span className="font-mono text-foreground">{organizationSlug}</span>
        </div>
        <div className="text-xs text-muted">
          Session role · <span className="font-semibold text-foreground">{role ?? "—"}</span>
        </div>
        <button
          type="submit"
          disabled={busyOrg}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busyOrg ? "Saving…" : "Save organization"}
        </button>
      </form>

      <form
        onSubmit={saveAccent}
        className="rounded-xl border border-card-border bg-card p-4 space-y-3"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Brand accent
        </div>
        <p className="text-xs text-muted">
          Stored in the database as setting key <code className="font-mono">brand.accent</code>.
        </p>
        <label className="text-xs font-semibold text-muted">
          Hex color
          <div className="mt-1 flex gap-2">
            <input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm font-mono"
            />
            <span
              className="h-10 w-14 shrink-0 rounded-lg border border-card-border"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          </div>
        </label>
        <button
          type="submit"
          disabled={busyAccent}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busyAccent ? "Saving…" : "Save accent"}
        </button>
      </form>
    </div>
  );
}
