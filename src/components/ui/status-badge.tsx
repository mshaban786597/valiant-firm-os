import { cn } from "@/lib/utils";

const VARIANTS: Record<string, string> = {
  success:
    "bg-emerald-500/15 text-emerald-600 ring-emerald-500/25 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  danger:
    "bg-valiant-soft text-valiant ring-valiant/30 dark:text-red-300 dark:ring-red-400/25",
  neutral: "bg-card-border/70 text-muted ring-black/[0.04] dark:ring-white/[0.06]",
  info: "bg-sky-500/15 text-sky-700 ring-sky-500/25 dark:text-sky-300",
};

export function StatusBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        VARIANTS[variant] ?? VARIANTS.neutral,
      )}
    >
      {label}
    </span>
  );
}
