"use client";

export function PrintButton({ label = "Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-card print:hidden"
    >
      {label}
    </button>
  );
}
