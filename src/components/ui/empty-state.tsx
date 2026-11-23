import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-card-border bg-card/50 px-4 py-14 text-center">
      <span
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-valiant-soft text-valiant dark:text-red-300"
        aria-hidden
      >
        <Icon className="h-6 w-6" />
      </span>
      <div className="text-base font-semibold text-foreground">{title}</div>
      {description ? <p className="mt-2 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
