"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  tone = "danger",
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  tone?: "danger" | "neutral";
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={open} title={title} onClose={() => !busy && onClose()}>
      {description ? <div className="mb-4 text-sm text-muted">{description}</div> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch {
              /* keep open; caller should toast */
            } finally {
              setBusy(false);
            }
          }}
          className={
            tone === "danger"
              ? "rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              : "rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-50"
          }
        >
          {busy ? "Working…" : confirmLabel ?? "Confirm"}
        </button>
      </div>
    </Modal>
  );
}
