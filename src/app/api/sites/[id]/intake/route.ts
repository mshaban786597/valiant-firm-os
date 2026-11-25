import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { receiveSiteLead } from "@/lib/site-leads/intake";
import { newIntakeKey } from "@/lib/site-leads/parse";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["enable", "rotate", "disable", "test"]) });

/**
 * Manage one site's lead intake: switch it on (creates its private address),
 * replace the address, switch it off, or send a test enquiry through the same
 * path a real form uses.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const org = await requirePermission("client.write");
  if (!org.ok) return org.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const site = await prisma.site.findFirst({ where: { id: params.id, organizationId: org.organizationId } });
  if (!site) return NextResponse.json({ error: "Website not found" }, { status: 404 });
  const { action } = parsed.data;
  let message = "";

  if (action === "test") {
    if (!site.intakeKey) return NextResponse.json({ error: "Switch lead intake on for this website first." }, { status: 409 });
    const r = await receiveSiteLead({
      site,
      source: "form_webhook",
      isTest: true,
      fields: {
        name: "Test enquiry",
        email: "test@valiantfirm.com",
        phone: "000-000-0000",
        message: `Test enquiry for ${site.domain}, sent from the Leads Inbox at ${new Date().toISOString()}.`,
        form: "Leads Inbox test",
      },
    });
    if (!r.ok) return NextResponse.json({ error: "The test enquiry could not be stored." }, { status: 502 });
    message = "Test enquiry stored. It is marked as a test and alerted nobody.";
  } else {
    const intakeKey = action === "disable" ? null : action === "enable" && site.intakeKey ? site.intakeKey : newIntakeKey();
    await prisma.site.update({ where: { id: site.id }, data: { intakeKey } });
    message =
      action === "disable"
        ? "Lead intake switched off. The old address no longer accepts anything."
        : action === "rotate"
          ? "New address created. Update the website's form; the old address no longer works."
          : "Lead intake switched on.";
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: `site.intake.${action}`,
    entity: "Site",
    entityId: site.id,
    meta: { domain: site.domain },
  });
  return NextResponse.json({ ok: true, message });
}
