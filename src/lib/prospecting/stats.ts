/**
 * Outreach results grouped by why the prospect was picked (category) and by
 * niche. Pure: counts only what is stored on the rows passed in.
 */
export interface StatLead {
  id: string;
  niche: string | null;
  outreachCategory: string | null;
  email: string | null;
  hasPendingDraft: boolean;
  sends: { step: number; status: string; openedAt: Date | null; scheduledFor: Date }[];
  replies: { label: string }[];
  meetings: { status: string }[];
}

export interface StatRow {
  key: string;
  prospects: number;
  withEmail: number;
  awaitingApproval: number;
  sent: number;
  opened: number;
  followUpsDue: number;
  replied: number;
  interested: number;
  meetings: number;
}

const blank = (key: string): StatRow => ({
  key,
  prospects: 0,
  withEmail: 0,
  awaitingApproval: 0,
  sent: 0,
  opened: 0,
  followUpsDue: 0,
  replied: 0,
  interested: 0,
  meetings: 0,
});

const LIVE_MEETING = ["confirmed", "rescheduled", "attended"];

export function groupOutreachStats(leads: StatLead[], by: "category" | "niche", now: Date = new Date()): StatRow[] {
  const rows: Record<string, StatRow> = {};
  leads.forEach((l) => {
    const key = (by === "category" ? l.outreachCategory : l.niche) || (by === "category" ? "manual" : "Unspecified");
    const r = (rows[key] = rows[key] ?? blank(key));
    r.prospects += 1;
    if (l.email) r.withEmail += 1;
    if (l.hasPendingDraft) r.awaitingApproval += 1;
    // A prospect counts once in each column, however many emails they got.
    if (l.sends.some((s) => s.status === "sent")) r.sent += 1;
    if (l.sends.some((s) => !!s.openedAt)) r.opened += 1;
    if (l.sends.some((s) => s.step > 0 && s.status === "scheduled" && s.scheduledFor.getTime() <= now.getTime())) r.followUpsDue += 1;
    if (l.replies.length) r.replied += 1;
    if (l.replies.some((x) => x.label === "interested")) r.interested += 1;
    if (l.meetings.some((m) => LIVE_MEETING.indexOf(m.status) !== -1)) r.meetings += 1;
  });
  return Object.keys(rows)
    .map((k) => rows[k]!)
    .sort((a, b) => b.prospects - a.prospects || a.key.localeCompare(b.key));
}

/** Where one prospect is in the sequence, in plain words. */
export function prospectStage(l: StatLead, now: Date = new Date()): string {
  if (l.meetings.some((m) => LIVE_MEETING.indexOf(m.status) !== -1)) return "Meeting booked";
  if (l.replies.some((x) => x.label === "interested")) return "Replied: interested";
  if (l.replies.length) return "Replied";
  const sent = l.sends.filter((s) => s.status === "sent");
  const nextFollowUp = l.sends
    .filter((s) => s.step > 0 && s.status === "scheduled")
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
  if (sent.length) {
    const opened = l.sends.some((s) => !!s.openedAt);
    if (nextFollowUp) {
      const due = nextFollowUp.scheduledFor.getTime() <= now.getTime();
      return `${opened ? "Opened" : "Sent"} · follow-up ${nextFollowUp.step} ${due ? "due now" : "scheduled"}`;
    }
    return opened ? "Opened · sequence finished" : "Sent · sequence finished";
  }
  if (l.sends.some((s) => s.status === "scheduled")) return "Approved · waiting to send";
  if (l.hasPendingDraft) return "Draft waiting for approval";
  if (!l.email) return "No email found";
  return "Not drafted";
}
