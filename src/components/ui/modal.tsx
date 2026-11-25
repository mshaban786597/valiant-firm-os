"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Dialog over the page. It is drawn at the end of <body> rather than where it
 * is used: glass panels blur what is behind them, and a blurred panel becomes
 * the frame for anything "fixed" inside it, which would trap a dialog opened
 * from within a card inside that card.
 */
export function Modal({
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
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-card-border bg-surface shadow-shell-dark"
      >
        <div className="flex items-center justify-between border-b border-card-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
