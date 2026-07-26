import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Use in `loading.tsx` files and inside Suspense
 * boundaries to reserve layout space while data streams in.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-card-border/60", className)}
      {...props}
    />
  );
}

/** A card-shaped skeleton block matching the dashboard KPI/panel cards. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-card-border bg-card p-5",
        className,
      )}
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-4 h-3 w-full" />
    </div>
  );
}
