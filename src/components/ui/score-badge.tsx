import { cn } from "@/lib/utils";

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="rounded-full bg-card-border/70 px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]">
        —
      </span>
    );
  }
  const variant =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300"
      : score >= 65
        ? "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300"
        : score >= 40
          ? "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-200"
          : "bg-valiant-soft text-valiant ring-valiant/30 dark:text-red-300";

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        variant,
      )}
    >
      {score}
    </span>
  );
}
