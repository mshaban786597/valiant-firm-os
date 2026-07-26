import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.04]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
        {trend ? (
          <span className="text-xs font-medium text-emerald-500">{trend}</span>
        ) : null}
      </div>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function KpiCardAccent({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-valiant/30 bg-gradient-to-br from-valiant-soft to-background p-4 shadow-[0_24px_80px_rgba(211,4,4,0.18)]",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}
