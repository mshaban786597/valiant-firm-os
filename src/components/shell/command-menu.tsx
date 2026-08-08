"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Command = { label: string; hint?: string; href: string };

const DESTINATIONS: Command[] = [
  { label: "Dashboard", href: "/dashboard", hint: "Overview" },
  { label: "Leads", href: "/leads" },
  { label: "Contacts", href: "/contacts" },
  { label: "Outreach", href: "/outreach" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Clients", href: "/clients" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Ecommerce", href: "/ecommerce" },
  { label: "Delivery / Tasks", href: "/delivery" },
  { label: "Content", href: "/content" },
  { label: "Reports", href: "/reports" },
  { label: "Health", href: "/health" },
  { label: "SEO / Search Console", href: "/seo" },
  { label: "Keyword performance", href: "/seo/keywords" },
  { label: "Rank tracking", href: "/seo/rank-tracking" },
  { label: "Google Business Profiles", href: "/gbp" },
  { label: "Google Ads", href: "/google-ads" },
  { label: "Email campaigns", href: "/email-campaigns" },
  { label: "Billing", href: "/billing" },
  { label: "Automations", href: "/automations" },
  { label: "Activity feed", href: "/activity" },
  { label: "Global search", href: "/search" },
  { label: "AI logs", href: "/ai-logs" },
  { label: "Settings", href: "/settings" },
];

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q))
      : DESTINATIONS;
    const extra: Command[] =
      q.length > 1
        ? [{ label: `Search everything for “${query.trim()}”`, href: `/search?q=${encodeURIComponent(query.trim())}` }]
        : [];
    return [...extra, ...base];
  }, [query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-card-border bg-card shadow-shell-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active].href);
            }
          }}
          placeholder="Jump to… or search everything"
          className="w-full border-b border-card-border bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted">No matches</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.href}-${i}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.href)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  i === active ? "bg-valiant-soft text-foreground" : "text-muted"
                }`}
              >
                <span>{r.label}</span>
                {r.hint ? <span className="text-xs text-muted">{r.hint}</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-card-border px-3 py-2 text-[11px] text-muted">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>⌘K / Ctrl K</span>
        </div>
      </div>
    </div>
  );
}
