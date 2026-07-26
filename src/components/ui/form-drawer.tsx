"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function FormDrawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-card-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-card-border px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-card-border/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">{children}</div>
      </div>
    </div>
  );
}
