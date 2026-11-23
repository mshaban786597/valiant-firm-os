import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { globalSearch } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ q: z.string().trim().max(100) });

/** Search-as-you-type for the header search bar. Org-scoped; read only. */
export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;
  const parsed = querySchema.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  const results = await globalSearch(org.organizationId, parsed.data.q, 5);
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
