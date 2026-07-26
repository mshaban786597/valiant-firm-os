"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  ["/dashboard", "Dash"],
  ["/leads", "Leads"],
  ["/pipeline", "Pipe"],
  ["/clients", "Clients"],
  ["/delivery", "Tasks"],
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="border-b border-card-border bg-card/90 px-4 py-2 lg:hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-card-border px-3 py-2 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Navigate</span>
        <Menu className="h-4 w-4" />
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-lg border border-card-border px-3 py-2 text-center text-xs font-semibold",
                pathname.startsWith(href)
                  ? "border-valiant/40 bg-valiant-soft"
                  : "bg-background",
              )}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
