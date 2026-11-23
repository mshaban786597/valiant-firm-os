"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isActivePath } from "@/components/layout/nav-items";
import { BrandMark } from "@/components/layout/brand-mark";

export function AppSidebar() {
  const pathname = usePathname();
  const { data } = useSession();
  const email = data?.user?.email ?? null;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-card-border bg-card/70 backdrop-blur-xl backdrop-saturate-150 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-3 border-b border-card-border px-5">
        <BrandMark size={36} className="shrink-0" />
        <div className="leading-tight">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Valiant Firm</div>
          <div className="text-sm font-semibold text-foreground">Agency OS</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/80">
              {group.title}
            </div>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-valiant-soft text-foreground"
                      : "text-muted hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-valiant" aria-hidden />
                  ) : null}
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors",
                      active ? "text-valiant dark:text-red-300" : "text-muted group-hover:text-foreground",
                    )}
                  />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-card-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-foreground/[0.04] p-2">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#D30404] to-[#7f0303] text-xs font-semibold text-white"
            aria-hidden
          >
            {(email ?? "").trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-medium text-foreground">{email ?? "—"}</div>
            <div className="truncate text-[10px] uppercase tracking-wide text-muted">{data?.role ?? "Signed in"}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
