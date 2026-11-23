"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isActivePath } from "@/components/layout/nav-items";
import { BrandMark } from "@/components/layout/brand-mark";

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 border-r border-card-border bg-card/80 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-card-border px-5">
        <BrandMark size={36} className="shrink-0" />
        <div className="leading-tight">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Valiant Firm
          </div>
          <div className="text-sm font-semibold text-foreground">Agency OS</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              {group.title}
            </div>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-valiant-soft text-foreground ring-1 ring-valiant/30"
                      : "text-muted hover:bg-card-border/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-card-border p-4 text-xs text-muted">
        Internal operating layer · SaaS-ready multi-tenant schema.
      </div>
    </aside>
  );
}
