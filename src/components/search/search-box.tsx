"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search leads, clients, deals, tasks, reports, invoices…"
        className="flex-1 rounded-lg border border-card-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-valiant/40"
      />
      <button
        type="submit"
        className="rounded-lg bg-valiant px-4 py-2.5 text-sm font-semibold text-white"
      >
        Search
      </button>
    </form>
  );
}
