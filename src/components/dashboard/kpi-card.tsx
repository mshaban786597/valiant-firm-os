import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { metricVisual, TONE_CHIP, type Tone } from "@/components/ui/metric-visual";

/** Small tinted square holding a figure's icon. */
export function IconChip({
  icon: Icon,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "h-10 w-10 rounded-xl" : size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-lg";
  const glyph = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", box, TONE_CHIP[tone], className)} aria-hidden>
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}

/**
 * One figure with its label. The icon comes from the label unless one is
 * passed, so every page that shows a figure gets a fitting icon.
 */
export function KpiCard({
  label,
  value,
  hint,
  trend,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  const visual = metricVisual(label);
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="pt-0.5 text-[11px] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">{label}</div>
        <IconChip icon={icon ?? visual.icon} tone={tone ?? visual.tone} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
        {trend ? <span className="text-xs font-medium text-emerald-500">{trend}</span> : null}
      </div>
      {hint ? <p className="mt-1.5 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/** The headline figure of a page. */
export function KpiCardAccent({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  const visual = metricVisual(label);
  const Icon = icon ?? visual.icon;
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#D30404] to-[#7f0303] p-4 text-white shadow-[0_18px_50px_-18px_rgba(211,4,4,0.65)]">
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="pt-0.5 text-[11px] font-semibold uppercase leading-snug tracking-[0.12em] text-white/80">{label}</div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="relative mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
