import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { recordMeetingEvent } from "@/lib/outreach/engine";

const schema = z.object({
  leadId: z.string().uuid(),
  calendarSource: z.enum(["google_calendar", "calendly", "test_calendar"]),
  /** The calendar's own event id: a meeting only exists once the calendar has it. */
  externalEventId: z.string().min(3).max(300),
  status: z.enum(["confirmed", "rescheduled", "canceled", "attended", "no_show"]),
  startsAt: z.string().datetime(),
  summary: z.string().max(5000).optional(),
});

/** Record a calendar event for a lead. Cancels and reschedules update the same meeting. */
export async function POST(req: Request) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, organizationId: org.organizationId },
    select: { id: true, isDemo: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (parsed.data.calendarSource === "test_calendar" && !lead.isDemo) {
    return NextResponse.json({ error: "The test calendar can only be used with demo leads." }, { status: 403 });
  }

  const r = await recordMeetingEvent({
    organizationId: org.organizationId,
    leadId: lead.id,
    calendarSource: parsed.data.calendarSource,
    externalEventId: parsed.data.externalEventId,
    status: parsed.data.status,
    startsAt: new Date(parsed.data.startsAt),
    summary: parsed.data.summary,
    isDemo: lead.isDemo,
  });
  return NextResponse.json({
    ...r,
    message: r.created
      ? `Meeting recorded (${parsed.data.status}).`
      : `Existing meeting updated to ${parsed.data.status}; no extra meeting was created.`,
  });
}
