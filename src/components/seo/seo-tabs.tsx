"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/seo", label: "Overview" },
  { href: "/seo/keywords", label: "Keywords" },
  { href: "/seo/rank-tracking", label: "Rank tracking" },
];

export function SeoTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 rounded-xl border border-card-border bg-card p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "bg-valiant-soft text-foreground ring-1 ring-valiant/30"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
