"use client";

import type { ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Bell, LayoutGrid, LogOut } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { navItemFor } from "@/components/layout/nav-items";
import { HeaderSearch } from "@/components/shell/header-search";

/** First letter of the signed-in person's email, for the account chip. */
function initial(email: string | null | undefined): string {
  return (email ?? "").trim().charAt(0).toUpperCase() || "?";
}

/**
 * Page header. On a phone it is the page's icon, title and that page's own
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
  const pathname = usePathname();
  const nav = navItemFor(pathname);
  const PageIcon = nav?.icon ?? LayoutGrid;
  const email = data?.user?.email ?? null;

  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-card-border bg-card text-muted transition-colors hover:border-valiant/40 hover:text-foreground";

  return (
    <header className="border-b border-card-border bg-card/70 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 lg:sticky lg:top-0 lg:z-30 lg:px-8 lg:py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:min-h-11">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-valiant-soft text-valiant dark:text-red-300"
              aria-hidden
            >
              <PageIcon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
              {nav && nav.label !== title ? (
                <p className="hidden truncate text-xs text-muted lg:block">{nav.label}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <HeaderSearch className="w-56 xl:w-72" />
          <Link href="/health" className={iconButton} aria-label="Open alerts" title="Alerts">
            <Bell className="h-4 w-4" />
          </Link>
          <ThemeToggle />
          <div className="ml-1 flex items-center gap-2 rounded-lg border border-card-border bg-card py-1 pl-1 pr-1">
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#D30404] to-[#7f0303] text-xs font-semibold text-white"
              aria-hidden
            >
              {initial(email)}
            </span>
            <div className="hidden max-w-[11rem] leading-tight xl:block">
              <div className="truncate text-xs font-medium text-foreground">{email ?? "—"}</div>
              {data?.role ? <div className="truncate text-[10px] uppercase tracking-wide text-muted">{data.role}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-valiant-soft hover:text-valiant"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden 2xl:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
