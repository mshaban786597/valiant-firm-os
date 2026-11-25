/**
 * Rewrite the outreach drafts that are still waiting for approval, using the
 * current email templates and each lead's stored evidence. Use after changing
 * the templates, the booking link or the postal address.
 *
 *   npx tsx --env-file=.env scripts/redraft-prospects.ts
 *
 * Only pending drafts are touched. Approved, rejected and sent emails are
 * never changed, and nothing is sent.
 */
import { prisma } from "../src/lib/prisma";
import { buildOutreachDraft, draftOptionsFromEnv } from "../src/lib/outreach/draft";

async function main() {
  const pending = await prisma.approvalRequest.findMany({
    where: { kind: "outreach_email", entityType: "Lead", status: "PENDING", entityId: { not: null } },
  });
  let updated = 0;
  for (const a of pending) {
    const lead = await prisma.lead.findUnique({
      where: { id: a.entityId! },
      include: { evidence: { orderBy: { observedAt: "desc" }, take: 20 } },
    });
    if (!lead) continue;
    const draft = buildOutreachDraft(lead, draftOptionsFromEnv(), lead.evidence);
    const note = /^Reviewer note:[^\n]*\n\n/.exec(a.body)?.[0] ?? "";
    await prisma.approvalRequest.update({
      where: { id: a.id },
      data: {
        title: `Outreach email → ${lead.businessName}`,
        body: `${note}To: ${lead.email ?? "(no email on lead)"}\nSubject: ${draft.subject}\n\n${draft.body}`,
        payload: { to: lead.email ?? undefined, subject: draft.subject, body: draft.body, category: draft.category },
      },
    });
    updated += 1;
  }
  console.log(`${updated} pending draft${updated === 1 ? "" : "s"} rewritten. Nothing was sent.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 300) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
