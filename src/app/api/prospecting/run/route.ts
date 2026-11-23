import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { resolveSerpProvider, runProspectTarget } from "@/lib/prospecting/run-target";
import { prospectRunSchema } from "@/lib/schemas/prospecting";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Run one saved search now. Finds prospects and writes drafts; never sends. */
export async function POST(req: Request) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;
  const parsed = prospectRunSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const target = await prisma.prospectTarget.findFirst({
    where: { id: parsed.data.targetId, organizationId: org.organizationId },
  });
  if (!target) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  const provider = await resolveSerpProvider(org.organizationId);
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "No search provider is connected, so the app cannot run this search by itself. Connect Ubersuggest on the Integrations page.",
      },
      { status: 409 },
    );
  }

  const r = await runProspectTarget(target, { provider, requestedBy: org.userId, maxNew: 8 });
  if (r.status !== "ok") return NextResponse.json({ error: r.error ?? "The search failed." }, { status: 502 });
  return NextResponse.json({
    ...r,
    message: `${r.resultsSeen} results checked: ${r.added.length} new prospect${r.added.length === 1 ? "" : "s"}, ${r.drafted} draft${r.drafted === 1 ? "" : "s"} waiting for approval${r.noEmail ? `, ${r.noEmail} with no published email` : ""}.`,
  });
}
