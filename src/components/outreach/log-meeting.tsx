"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useCan } from "@/components/providers/permissions-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

type LeadOption = { id: string; businessName: string };

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";
const empty = { leadId: "", calendarSource: "google_calendar", externalEventId: "", status: "confirmed", startsAt: "", summary: "" };

/** Record a booked meeting from the calendar. Booking a meeting stops the remaining follow-ups. */
export function LogMeetingButton({ leads }: { leads: LeadOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const canWrite = useCan()("lead.write");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(empty);

  if (!canWrite) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.leadId || !f.externalEventId.trim() || !f.startsAt) {
      return toast.error("Choose the lead, paste the calendar event link or ID, and set the time.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/outreach/meetings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: f.leadId,
          calendarSource: f.calendarSource,
          externalEventId: f.externalEventId.trim(),
          status: f.status,
          startsAt: new Date(f.startsAt).toISOString(),
          summary: f.summary.trim() || undefined,
        }),
      });
      if (!res.ok) return toast.error(await errorMessageFromResponse(res));
      const data = (await res.json()) as { message: string };
      toast.success(data.message);
      setF(empty);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold"
      >
        Log a meeting
      </button>
      <Modal open={open} title="Log a meeting" onClose={() => !busy && setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted">
            Paste the event link or ID from the calendar where the meeting was booked. Using the same event again
            updates that meeting instead of adding another.
          </p>
          <label className="block text-xs font-semibold text-muted">
            Lead
            <select value={f.leadId} onChange={(e) => setF((p) => ({ ...p, leadId: e.target.value }))} className={input}>
              <option value="">— Choose a lead —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.businessName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-muted">
              Calendar
              <select value={f.calendarSource} onChange={(e) => setF((p) => ({ ...p, calendarSource: e.target.value }))} className={input}>
                <option value="google_calendar">Google Calendar</option>
                <option value="calendly">Calendly</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Status
              <select value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))} className={input}>
                <option value="confirmed">Confirmed</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="attended">Attended</option>
                <option value="no_show">No-show</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-muted">
            Calendar event link or ID
            <input value={f.externalEventId} onChange={(e) => setF((p) => ({ ...p, externalEventId: e.target.value }))} className={input} />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Date and time
            <input type="datetime-local" value={f.startsAt} onChange={(e) => setF((p) => ({ ...p, startsAt: e.target.value }))} className={input} />
          </label>
          <label className="block text-xs font-semibold text-muted">
            Notes (optional)
            <textarea rows={3} value={f.summary} onChange={(e) => setF((p) => ({ ...p, summary: e.target.value }))} className={input} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-card-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save meeting"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
