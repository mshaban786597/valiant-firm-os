"use client";

export function AiOutputPanel({
  title,
  payload,
}: {
  title: string;
  payload: unknown;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-background/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed text-emerald-100 dark:bg-black/60">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}
