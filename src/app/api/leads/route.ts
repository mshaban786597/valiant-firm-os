import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { runTrigger } from "@/lib/automations/engine";

const leadCreateSchema = z.object({
  businessName: z.string(),
  niche: z.string(),
  city: z.string(),
  state: z.string(),
  websiteUrl: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  domainAuthority: z.number().nullable().optional(),
  reviewCount: z.number().nullable().optional(),
  starRating: z.number().nullable().optional(),
  gbpStatus: z.string().nullable().optional(),
  websiteStatus: z.string().nullable().optional(),
  weaknessTags: z.array(z.string()).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
});

export async function GET(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const niche = searchParams.get("niche")?.trim();
  const city = searchParams.get("city")?.trim();
  const status = searchParams.get("status") as LeadStatus | null;
  const minScoreRaw = searchParams.get("minScore");
  const minScore = minScoreRaw ? Number(minScoreRaw) : undefined;

  const filters = [];
  if (q) {
    filters.push({
      OR: [
        { businessName: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  if (niche) {
    filters.push({ niche: { equals: niche, mode: "insensitive" as const } });
  }
  if (city) {
    filters.push({ city: { equals: city, mode: "insensitive" as const } });
  }
  if (status) {
    filters.push({ status });
  }
  if (minScore !== undefined && !Number.isNaN(minScore)) {
    filters.push({ leadScore: { gte: minScore } });
  }

  const leads = await prisma.lead.findMany({
    where: {
      organizationId: org.organizationId,
      ...(filters.length ? { AND: filters } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ leads });
}

export async function POST(req: Request) {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = leadCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: org.organizationId,
      ...parsed.data,
      weaknessTags: parsed.data.weaknessTags ?? [],
      status: parsed.data.status ?? LeadStatus.Raw,
    },
  });

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "lead.create",
    entity: "Lead",
    entityId: lead.id,
  });

  await runTrigger("lead_created", {
    organizationId: org.organizationId,
    userId: org.userId,
    leadId: lead.id,
    payload: { businessName: lead.businessName, niche: lead.niche },
  }).catch(() => {});

  return NextResponse.json({ lead });
}
