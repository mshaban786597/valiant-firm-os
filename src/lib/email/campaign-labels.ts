const RECIPIENT_LABEL: Record<string, string> = {
  pending: "Waiting",
  sending: "Sending",
  sent: "Sent",
  failed: "Refused",
  skipped: "Skipped",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
};

/** The word shown for one recipient's status. */
export function recipientLabel(status: string): string {
  return RECIPIENT_LABEL[status] ?? status;
}

/** Why a recipient was skipped or refused, or what is known after it was sent. */
export function recipientDetail(
  r: { status: string; error: string | null; sentAt: string | null; openedAt: string | null; clickedAt: string | null },
  fmt: (iso: string) => string = (iso) => new Date(iso).toLocaleString(),
): string {
  if (r.status === "skipped" || r.status === "failed" || r.status === "bounced") return r.error ?? "";
  if (r.clickedAt) return `Clicked ${fmt(r.clickedAt)}`;
  if (r.openedAt) return `Opened ${fmt(r.openedAt)}`;
  if (r.sentAt) return `Sent ${fmt(r.sentAt)}`;
  return "";
}
