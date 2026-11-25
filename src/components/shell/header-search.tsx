"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import type { SearchResults } from "@/lib/search";

interface Row {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  href: string;
}

const MIN_CHARS = 2;

/**
 * Search bar for the app header (phone and desktop). Typing lists matching
 * pages straight away and matching records from the server; Enter opens the
 * full results page.
 */
export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [records, setRecords] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const q = query.trim();

  // Records: ask the server shortly after the person stops typing.
  useEffect(() => {
    if (q.length < MIN_CHARS) {
      setRecords(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setRecords((await res.json()) as SearchResults);
        setFailed(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setRecords(null);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Leaving the page closes and clears the box.
  useEffect(() => {
    setOpen(false);
    setQuery("");
    setActive(-1);
  }, [pathname]);

  // A tap or click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    const pages: Row[] = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((n) => ({ key: `page-${n.href}`, group: "Pages", title: n.label, href: n.href }));
    const found: Row[] = (records?.query === q ? records.groups : []).flatMap((g) =>
      g.hits.map((h) => ({
        key: `${h.type}-${h.id}`,
        group: g.type,
        title: h.title,
        subtitle: h.subtitle,
        href: h.href,
      })),
    );
    return [...pages, ...found];
  }, [q, records]);

  const allHref = `/search?q=${encodeURIComponent(q)}`;
  const showList = open && q.length > 0;
  const waiting = q.length >= MIN_CHARS && (loading || records?.query !== q) && !failed;

  function go(href: string) {
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      if (!q) return;
      e.preventDefault();
      const row = active >= 0 ? rows[active] : undefined;
      go(row ? row.href : allHref);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={rootRef} className={cn("lg:relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search the app"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search…"
          className="h-10 w-full rounded-lg border border-card-border bg-background pl-9 pr-9 text-sm text-foreground outline-none ring-valiant/30 placeholder:text-muted focus:border-valiant/40 focus:ring-2 lg:h-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setActive(-1);
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-foreground"
          >
            {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {showList ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-2 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-card-border bg-surface p-1 shadow-xl lg:inset-x-auto lg:right-0 lg:mt-2 lg:w-[26rem]"
        >
          {rows.map((row, i) => (
            <div key={row.key}>
              {i === 0 || rows[i - 1]!.group !== row.group ? (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {row.group}
                </div>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(row.href)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                  i === active ? "bg-valiant-soft text-foreground" : "text-foreground hover:bg-background",
                )}
              >
                <span className="min-w-0 truncate font-medium">{row.title}</span>
                {row.subtitle ? <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{row.subtitle}</span> : null}
              </button>
            </div>
          ))}

          {q.length < MIN_CHARS ? (
            rows.length === 0 ? <div className="px-3 py-3 text-sm text-muted">Keep typing to search records.</div> : null
          ) : failed ? (
            <div className="px-3 py-3 text-sm text-muted">Search is not responding. Press Enter to open the results page.</div>
          ) : waiting ? (
            <div className="px-3 py-3 text-sm text-muted">Searching…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted">Nothing matches “{q}”.</div>
          ) : null}

          {q.length >= MIN_CHARS ? (
            <button
              type="button"
              onClick={() => go(allHref)}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-card-border px-3 py-2.5 text-left text-sm font-medium text-valiant hover:bg-background"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">See all results for “{q}”</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
