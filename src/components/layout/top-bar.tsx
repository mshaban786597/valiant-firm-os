"use client";

import type { ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { HeaderSearch } from "@/components/shell/header-search";

/**
 * Page header. On a phone it is just the page title and that page's own
 * actions: search, alerts, theme and sign-out live in the app bar and menu
 * above it. On desktop it also carries the search bar and account controls,
 * and stays in view while the page scrolls.
 */
export function TopBar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { data } = useSession();
  return (
    <header className="border-b border-card-border bg-card/70 px-4 py-3 backdrop-blur lg:sticky lg:top-0 lg:z-30 lg:bg-card/85 lg:px-8 lg:py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:min-h-12">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
            <p className="hidden truncate text-xs text-muted lg:block">
              Signed in as {data?.user?.email ?? "—"}
              {data?.role ? ` · ${data.role}` : ""}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <HeaderSearch className="w-56 xl:w-80" />
          <Link
            href="/health"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-card-border bg-card px-3 text-xs font-medium text-muted hover:border-valiant/40 hover:text-foreground"
            aria-label="Open alerts"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden xl:inline">Alerts</span>
          </Link>
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
      </div>
    </header>
  );
}
