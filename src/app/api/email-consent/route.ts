import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { writeAuditLog } from "@/lib/audit";
import { consentPermission, setEmailConsent } from "@/lib/email/audience";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["client", "contact", "lead"]),
  id: z.string().uuid(),
  agreed: z.boolean(),
});

/** Mark that a client, contact or lead agreed (or no longer agrees) to marketing email. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { kind, id, agreed } = parsed.data;

  const org = await requirePermission(consentPermission(kind));
  if (!org.ok) return org.response;

  const done = await setEmailConsent({ kind, id, organizationId: org.organizationId, agreed });
  if (!done) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: `${kind}.email_consent`,
    entity: kind === "client" ? "Client" : kind === "contact" ? "Contact" : "Lead",
    entityId: id,
    meta: { agreed },
  });
  return NextResponse.json({ ok: true, agreed });
}
