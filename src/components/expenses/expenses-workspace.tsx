"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

export type ExpenseRow = {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  billingCycle: string;
  amountCents: number | null;
  monthlyCents: number | null;
  plannedLowCents: number | null;
  plannedHighCents: number | null;
  status: string;
  notes: string | null;
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });
const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";
const CYCLE: Record<string, string> = { monthly: "per month", yearly: "per year", one_time: "one time" };

type FormState = {
  id: string | null;
  name: string;
  vendor: string;
  category: string;
  billingCycle: string;
  amount: string;
  plannedLow: string;
  plannedHigh: string;
  status: string;
  notes: string;
};

const EMPTY: FormState = {
  id: null, name: "", vendor: "", category: "Software", billingCycle: "monthly",
  amount: "", plannedLow: "", plannedHigh: "", status: "active", notes: "",
};

/** "12.50" → 1250; "" → null; invalid → undefined */
function toCents(v: string): number | null | undefined {
  const t = v.trim().replace(/[$,]/g, "");
  if (t === "") return null;
  const n = Number(t);
  if (!isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export function ExpensesWorkspace({ expenses }: { expenses: ExpenseRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("expense.write");
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(e: ExpenseRow) {
    setForm({
      id: e.id,
      name: e.name,
      vendor: e.vendor ?? "",
      category: e.category,
      billingCycle: e.billingCycle,
      amount: e.amountCents === null ? "" : String(e.amountCents / 100),
      plannedLow: e.plannedLowCents === null ? "" : String(e.plannedLowCents / 100),
      plannedHigh: e.plannedHighCents === null ? "" : String(e.plannedHighCents / 100),
      status: e.status,
      notes: e.notes ?? "",
    });
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form) return;
    if (!form.name.trim()) return toast.error("Enter the tool name.");
    const amountCents = toCents(form.amount);
    const plannedLowCents = toCents(form.plannedLow);
    const plannedHighCents = toCents(form.plannedHigh);
    if (amountCents === undefined || plannedLowCents === undefined || plannedHighCents === undefined) {
      return toast.error("Amounts must be numbers, for example 99 or 99.50.");
    }
    setBusy(true);
    try {
      const res = await fetch(form.id ? `/api/expenses/${form.id}` : "/api/expenses", {
        method: form.id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          vendor: form.vendor.trim() || null,
          category: form.category,
          billingCycle: form.billingCycle,
          amountCents,
          plannedLowCents,
          plannedHighCents,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success(form.id ? "Expense updated." : "Expense added.");
      setForm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: ExpenseRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${e.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      toast.success(`${e.name} removed.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Tools and subscriptions</h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setForm({ ...EMPTY })}
            className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_40px_rgba(211,4,4,0.25)]"
          >
            Add expense
          </button>
        ) : null}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description="Add each tool or subscription with what you actually pay, so net profit is real."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actual cost</th>
                <th className="px-4 py-3">Per month</th>
                <th className="px-4 py-3">Planned range / month</th>
                {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-xs text-muted">
                      {e.category}
                      {e.vendor ? ` · ${e.vendor}` : ""}
                    </div>
                    {e.notes ? <div className="mt-1 text-xs text-muted">{e.notes}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={e.status === "active" ? "Active" : e.status === "planned" ? "Planned" : "Canceled"}
                      variant={e.status === "active" ? "success" : e.status === "planned" ? "info" : "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {e.amountCents === null ? (
                      <StatusBadge label="Amount not entered" variant="warning" />
                    ) : (
                      <span>
                        {usd(e.amountCents)} <span className="text-xs text-muted">{CYCLE[e.billingCycle]}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{e.monthlyCents === null ? "—" : usd(e.monthlyCents)}</td>
                  <td className="px-4 py-3 text-muted">
                    {e.plannedLowCents !== null && e.plannedHighCents !== null
                      ? `${usd(e.plannedLowCents)} – ${usd(e.plannedHighCents)}`
                      : "—"}
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" disabled={busy} onClick={() => edit(e)} className="rounded-lg bg-valiant px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          {e.amountCents === null ? "Enter amount" : "Edit"}
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(e)} className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">
                          Remove
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={form !== null} title={form?.id ? "Edit expense" : "Add expense"} onClose={() => !busy && setForm(null)}>
        {form ? (
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted sm:col-span-2">
                Tool or subscription
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
              </label>
              <label className="text-xs font-semibold text-muted">
                Category
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                Status
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
                  <option value="active">Active (paying now)</option>
                  <option value="planned">Planned (not paying yet)</option>
                  <option value="canceled">Canceled</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                Actual amount (USD)
                <input inputMode="decimal" placeholder="Leave empty if unknown" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
              </label>
              <label className="text-xs font-semibold text-muted">
                Billed
                <select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })} className={input}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="one_time">One time</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                Planned low / month (USD)
                <input inputMode="decimal" value={form.plannedLow} onChange={(e) => setForm({ ...form, plannedLow: e.target.value })} className={input} />
              </label>
              <label className="text-xs font-semibold text-muted">
                Planned high / month (USD)
                <input inputMode="decimal" value={form.plannedHigh} onChange={(e) => setForm({ ...form, plannedHigh: e.target.value })} className={input} />
              </label>
              <label className="text-xs font-semibold text-muted sm:col-span-2">
                Notes
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
