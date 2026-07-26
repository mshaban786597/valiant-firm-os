"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { formatCents, invoiceTotals, toCents } from "@/lib/money";

export type InvoiceRow = {
  id: string;
  number: string | null;
  clientName: string | null;
  status: "Draft" | "Open" | "Paid" | "Void";
  totalCents: number;
  currency: string;
  dueAt: string | null;
  createdAt: string;
  lineItemCount: number;
};

type ClientOption = { id: string; businessName: string };

type DraftLine = { description: string; quantity: string; unitDollars: string };

const emptyLine: DraftLine = { description: "", quantity: "1", unitDollars: "" };

function statusVariant(status: InvoiceRow["status"]) {
  if (status === "Paid") return "success" as const;
  if (status === "Open") return "info" as const;
  if (status === "Void") return "neutral" as const;
  return "warning" as const;
}

export function BillingWorkspace({
  invoices,
  clients,
}: {
  invoices: InvoiceRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("invoice.write");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function transition(id: string, action: "send" | "paid" | "void" | "delete") {
    setBusyId(id);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/invoices/${id}`, { method: "DELETE", credentials: "include" })
          : await fetch(`/api/invoices/${id}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: action === "send" ? "Open" : action === "paid" ? "Paid" : "Void",
              }),
            });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success(
        action === "delete" ? "Invoice deleted." : "Invoice updated.",
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
          >
            New invoice
          </button>
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create your first invoice to start tracking billing and payments."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{inv.number ?? inv.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted">{inv.lineItemCount} line items</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{inv.clientName ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {formatCents(inv.totalCents, inv.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={inv.status} variant={statusVariant(inv.status)} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!canWrite && <span className="text-xs text-muted">—</span>}
                      {canWrite && inv.status === "Draft" && (
                        <>
                          <ActionBtn
                            label="Send"
                            onClick={() => transition(inv.id, "send")}
                            busy={busyId === inv.id}
                          />
                          <ActionBtn
                            label="Delete"
                            variant="ghost"
                            onClick={() => transition(inv.id, "delete")}
                            busy={busyId === inv.id}
                          />
                        </>
                      )}
                      {canWrite && inv.status === "Open" && (
                        <>
                          <ActionBtn
                            label="Mark paid"
                            onClick={() => transition(inv.id, "paid")}
                            busy={busyId === inv.id}
                          />
                          <ActionBtn
                            label="Void"
                            variant="ghost"
                            onClick={() => transition(inv.id, "void")}
                            busy={busyId === inv.id}
                          />
                        </>
                      )}
                      {canWrite && (inv.status === "Paid" || inv.status === "Void") && (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewInvoiceModal
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  busy,
  variant = "solid",
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  variant?: "solid" | "ghost";
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={
        variant === "solid"
          ? "rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          : "rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}

function NewInvoiceModal({
  open,
  onClose,
  clients,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [number, setNumber] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [discountRate, setDiscountRate] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);

  const totals = useMemo(() => {
    const items = lines
      .filter((l) => l.description.trim() && l.unitDollars.trim())
      .map((l) => ({
        unitCents: toCents(Number(l.unitDollars) || 0),
        quantity: Math.max(1, Number(l.quantity) || 1),
      }));
    return invoiceTotals(items, {
      discountPercent: Number(discountRate) || 0,
      taxPercent: Number(taxRate) || 0,
    });
  }, [lines, discountRate, taxRate]);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const lineItems = lines
      .filter((l) => l.description.trim() && l.unitDollars.trim())
      .map((l) => ({
        description: l.description.trim(),
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitCents: toCents(Number(l.unitDollars) || 0),
      }));
    if (lineItems.length === 0) {
      toast.error("Add at least one line item with a description and amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId || null,
          number: number.trim() || null,
          discountRate: Number(discountRate) || 0,
          taxRate: Number(taxRate) || 0,
          dueAt: dueAt ? new Date(`${dueAt}T12:00:00.000Z`).toISOString() : null,
          lineItems,
        }),
      });
      if (!res.ok) {
        toast.error(await errorMessageFromResponse(res));
        return;
      }
      toast.success("Invoice created.");
      // reset
      setLines([{ ...emptyLine }]);
      setClientId("");
      setNumber("");
      setDueAt("");
      setDiscountRate("0");
      setTaxRate("0");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="New invoice" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">
            Client (optional)
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Invoice number (optional)
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted">Line items</div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input
                placeholder="Description"
                value={l.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                className="col-span-6 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Qty"
                inputMode="numeric"
                value={l.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                className="col-span-2 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Unit $"
                inputMode="decimal"
                value={l.unitDollars}
                onChange={(e) => updateLine(i, { unitDollars: e.target.value })}
                className="col-span-3 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                aria-label="Remove line"
                onClick={() =>
                  setLines((prev) =>
                    prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i),
                  )
                }
                className="col-span-1 rounded-lg border border-card-border text-xs text-muted hover:bg-card-border/60"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
            className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold"
          >
            + Add line
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-semibold text-muted">
            Discount %
            <input
              inputMode="decimal"
              value={discountRate}
              onChange={(e) => setDiscountRate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Tax %
            <input
              inputMode="decimal"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted">
            Due date
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="rounded-lg border border-card-border bg-background/40 p-3 text-sm">
          <Row label="Subtotal" value={formatCents(totals.subtotalCents)} />
          <Row label="Discount" value={`- ${formatCents(totals.discountCents)}`} />
          <Row label="Tax" value={formatCents(totals.taxCents)} />
          <div className="mt-1 flex justify-between border-t border-card-border pt-1 font-semibold">
            <span>Total</span>
            <span>{formatCents(totals.totalCents)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
