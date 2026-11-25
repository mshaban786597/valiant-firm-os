"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NAV_GROUPS, isActivePath } from "@/components/layout/nav-items";
import { HeaderSearch } from "@/components/shell/header-search";

/**
 * Phone and tablet app bar: logo, search, alerts and the menu. It stays at the
 * top while the page scrolls. The menu holds every module plus the account
 * controls that sit in the page header on desktop.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data } = useSession();

  // Close the menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the full-screen menu is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const iconButton =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-card-border text-foreground";

  return (
    <div className="sticky top-0 z-40 lg:hidden print:hidden">
      <div className="relative flex h-14 items-center gap-2 border-b border-card-border bg-card px-3">
        <Link href="/dashboard" aria-label="Valiant Firm Agency OS: dashboard" className="shrink-0">
          <BrandMark size={34} />
        </Link>
        <HeaderSearch className="min-w-0 flex-1" />
        <Link href="/health" aria-label="Open alerts" className={iconButton}>
          <Bell className="h-5 w-5" />
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={iconButton}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Full menu (all modules) */}
      {open ? (
        <nav className="fixed inset-x-0 bottom-0 top-14 z-50 overflow-y-auto overscroll-contain bg-surface p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActivePath(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "border-valiant/40 bg-valiant-soft text-foreground"
                            : "border-card-border bg-background text-muted",
                        )}
                      >
                        <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-valiant dark:text-red-300" : "opacity-90")} />
                        <span className="min-w-0 leading-tight">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-card-border bg-background p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Account</div>
              <div className="mt-1 break-all text-sm font-medium text-foreground">{data?.user?.email ?? "—"}</div>
              {data?.role ? <div className="text-xs text-muted">{data.role}</div> : null}
              <div className="mt-3 flex items-center gap-2">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-valiant px-3 text-sm font-semibold text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
