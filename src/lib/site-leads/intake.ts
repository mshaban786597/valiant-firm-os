import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/dispatch";
import { dedupeKey, hasContent, leadSummary, normalizeSubmission } from "@/lib/site-leads/parse";

export type ReceiveResult =
  | { ok: true; leadId: string; duplicate: boolean; status: string }
  | { ok: false; reason: "empty" | "rate_limited" };

/** No single site may flood the inbox: at most this many enquiries in ten minutes. */
const MAX_PER_TEN_MINUTES = 40;

/**
 * Store one enquiry for a website. A repeat of the same enquiry within ten
 * minutes returns the first one. Bot submissions are stored as spam and never
 * alert anyone. Test enquiries are stored and marked, and never alert either.
 */
export async function receiveSiteLead(input: {
  site: { id: string; organizationId: string; domain: string; name: string; clientId: string | null };
  fields: Record<string, unknown>;
  source: "form_webhook" | "email_forward" | "manual";
  isTest?: boolean;
  fallbackPageUrl?: string | null;
  now?: Date;
}): Promise<ReceiveResult> {
  const now = input.now ?? new Date();
  const lead = normalizeSubmission(input.fields);
  if (!hasContent(lead)) return { ok: false, reason: "empty" };

  const recent = await prisma.siteLead.count({
    where: { siteId: input.site.id, receivedAt: { gte: new Date(now.getTime() - 600_000) } },
  });
  if (recent >= MAX_PER_TEN_MINUTES) return { ok: false, reason: "rate_limited" };

  const key = dedupeKey(lead, now);
  const status = lead.honeypot ? "spam" : "new";
  try {
    const created = await prisma.siteLead.create({
      data: {
        organizationId: input.site.organizationId,
        siteId: input.site.id,
        clientId: input.site.clientId,
        source: input.source,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        message: lead.message,
        pageUrl: lead.pageUrl ?? input.fallbackPageUrl ?? null,
        formName: lead.formName,
        fields: Object.keys(lead.extra).length ? lead.extra : Prisma.JsonNull,
        status,
        isTest: input.isTest ?? false,
        dedupeKey: key,
        receivedAt: now,
      },
    });
    if (status === "new" && !input.isTest) {
      await notify({
        organizationId: input.site.organizationId,
        event: "new_lead",
        title: `${input.site.domain}: ${leadSummary(lead)}`,
        body: lead.message ? lead.message.slice(0, 300) : null,
        path: "/inbox",
      }).catch(() => []);
    }
    return { ok: true, leadId: created.id, duplicate: false, status };
  } catch (e) {
    // Unique (siteId, dedupeKey): the same enquiry arrived twice.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const first = await prisma.siteLead.findUnique({
        where: { siteId_dedupeKey: { siteId: input.site.id, dedupeKey: key } },
        select: { id: true, status: true },
      });
      if (first) return { ok: true, leadId: first.id, duplicate: true, status: first.status };
    }
    throw e;
  }
}
