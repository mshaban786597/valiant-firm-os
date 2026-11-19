/** Statuses and labels for website enquiries. Safe to import in the browser. */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "closed", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  closed: "Closed",
  spam: "Spam",
};

export const LEAD_SOURCE_LABEL: Record<string, string> = {
  form_webhook: "Website form",
  email_forward: "Forwarded email",
  manual: "Added by hand",
};
