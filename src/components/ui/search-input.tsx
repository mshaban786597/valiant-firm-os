import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
      <input
        className={cn(
          "w-full rounded-lg border border-card-border bg-card py-2 pl-9 pr-3 text-sm outline-none ring-valiant/30 placeholder:text-muted focus:ring-2",
          className,
        )}
        {...props}
      />
    </div>
  );
}
