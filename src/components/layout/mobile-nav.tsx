"use client";

import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isActivePath } from "@/components/layout/nav-items";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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

  return (
    <div className="lg:hidden">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b border-card-border bg-card/90 px-4 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BrandMark size={30} className="shrink-0" />
          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Valiant Firm
            </div>
            <div className="text-sm font-semibold text-foreground">Agency OS</div>
          </div>
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-card-border text-foreground"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Full menu (all modules) */}
      {open ? (
        <>
          <div
            className="fixed inset-0 top-14 z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <nav className="fixed inset-x-0 top-14 bottom-0 z-50 overflow-y-auto border-t border-card-border bg-card p-3">
            <div className="space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(({ href, label, icon: Icon }) => {
                      const active = isActivePath(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                            active
                              ? "border-valiant/40 bg-valiant-soft text-foreground"
                              : "border-card-border bg-background text-muted",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 opacity-90" />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
