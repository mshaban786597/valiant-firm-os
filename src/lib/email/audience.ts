import { prisma } from "@/lib/prisma";

/**
 * Who may be added to an email campaign. Marketing email goes only to people
 * who agreed to get it, so every source is filtered by the consent mark
 * (emailConsentAt). A cold lead without the mark is never added.
 */
export type AudienceSource = "clients" | "contacts" | "leads";
export type ConsentKind = "client" | "contact" | "lead";

export interface Candidate {
  email: string;
  clientId?: string;
  leadId?: string;
}

const WHERE = (organizationId: string) => ({ organizationId, email: { not: null }, emailConsentAt: { not: null } });

export async function consentingAudience(source: AudienceSource, organizationId: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  if (source === "clients") {
    const rows = await prisma.client.findMany({ where: WHERE(organizationId), select: { id: true, email: true } });
    for (const r of rows) if (r.email) out.push({ email: r.email, clientId: r.id });
  } else if (source === "contacts") {
    const rows = await prisma.contact.findMany({ where: WHERE(organizationId), select: { email: true, clientId: true } });
    for (const r of rows) if (r.email) out.push({ email: r.email, ...(r.clientId ? { clientId: r.clientId } : {}) });
  } else {
    const rows = await prisma.lead.findMany({ where: WHERE(organizationId), select: { id: true, email: true } });
    for (const r of rows) if (r.email) out.push({ email: r.email, leadId: r.id });
  }
  return out;
}

const WHERE_TO_MARK: Record<AudienceSource, string> = {
  clients: "No clients have agreed to marketing email yet. Mark them on the client page first.",
  contacts: "No contacts have agreed to marketing email yet. Mark them on the Contacts page first.",
  leads: "No leads have agreed to marketing email yet. Mark a lead on its page once it has agreed.",
};

/** What to say when a source has nobody who agreed. */
export function nobodyAgreedMessage(source: AudienceSource): string {
  return WHERE_TO_MARK[source];
}

/** The permission needed to change the consent mark on each kind of record. */
export function consentPermission(kind: ConsentKind): "client.write" | "contact.write" | "lead.write" {
  return kind === "client" ? "client.write" : kind === "contact" ? "contact.write" : "lead.write";
}

/** Set or clear the consent mark. Returns false when the record is not in this organization. */
export async function setEmailConsent(input: {
  kind: ConsentKind;
  id: string;
  organizationId: string;
  agreed: boolean;
  now?: Date;
}): Promise<boolean> {
  const where = { id: input.id, organizationId: input.organizationId };
  const data = { emailConsentAt: input.agreed ? (input.now ?? new Date()) : null };
  const done =
    input.kind === "client"
      ? await prisma.client.updateMany({ where, data })
      : input.kind === "contact"
        ? await prisma.contact.updateMany({ where, data })
        : await prisma.lead.updateMany({ where, data });
  return done.count === 1;
}
