"use client";

import type { ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function TopBar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { data } = useSession();
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-card-border bg-card/70 px-4 py-2 backdrop-blur lg:px-8">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-xs text-muted">
              Signed in as {data?.user?.email ?? "—"}
              {data?.role ? ` · ${data.role}` : ""}
            </p>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-card-border bg-card px-3 text-xs font-medium text-muted hover:border-valiant/40 hover:text-foreground"
          aria-label="Alerts"
        >
          <Bell className="h-4 w-4" />
          <span className="hidden sm:inline">Alerts</span>
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-valiant px-3 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.35)] hover:bg-valiant/90"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </header>
  );
}
