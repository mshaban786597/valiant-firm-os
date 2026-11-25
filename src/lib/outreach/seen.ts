/**
 * What is known about an outreach email after it left. Opens and clicks are
 * only reported by a tracking email service; an email sent from a plain mailbox
 * has no such report, and saying "not opened" for it would be a guess.
 */
export interface SeenInput {
  status: string;
  provider: string | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  openCount: number;
  clickedAt: Date | null;
}

export function seenText(s: SeenInput, fmt: (d: Date) => string = (d) => d.toLocaleString()): string {
  if (s.clickedAt) return `Clicked ${fmt(s.clickedAt)}`;
  if (s.openedAt) return `Opened ${fmt(s.openedAt)}${s.openCount > 1 ? ` (${s.openCount}×)` : ""}`;
  if (s.deliveredAt) return "Delivered, not opened";
  if (s.status !== "sent") return "—";
  if (s.provider === "mailbox") return "Sent from your mailbox (opens are not tracked)";
  return "No delivery report yet";
}
