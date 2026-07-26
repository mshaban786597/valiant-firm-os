import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { parseCsv } from "@/lib/import";

const bodySchema = z.object({ csv: z.string().min(1).max(2_000_000) });

const rowSchema = z.object({
  businessName: z.string().min(1),
  niche: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  websiteUrl: z.string().optional(),
  source: z.string().optional(),
});

export async function POST(req: Request) {
  const org = await requirePermission("lead.write");
  if (!org.ok) return org.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found" }, { status: 400 });
  }

  // Existing (businessName|city) keys for duplicate detection.
  const existing = await prisma.lead.findMany({
    where: { organizationId: org.organizationId },
    select: { businessName: true, city: true },
  });
  const seen = new Set(
    existing.map((l) => `${l.businessName.toLowerCase()}|${l.city.toLowerCase()}`),
  );

  const toCreate: z.infer<typeof rowSchema>[] = [];
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  rows.forEach((raw, i) => {
    const r = rowSchema.safeParse(raw);
    if (!r.success) {
      errors.push({ row: i + 2, reason: "missing required fields" });
      return;
    }
    const key = `${r.data.businessName.toLowerCase()}|${r.data.city.toLowerCase()}`;
    if (seen.has(key)) {
      skipped++;
      return;
    }
    seen.add(key);
    toCreate.push(r.data);
  });

  if (toCreate.length > 0) {
    await prisma.lead.createMany({
      data: toCreate.map((r) => ({
        organizationId: org.organizationId,
        businessName: r.businessName,
        niche: r.niche,
        city: r.city,
        state: r.state,
        email: r.email || null,
        phone: r.phone || null,
        websiteUrl: r.websiteUrl || null,
        source: r.source || "csv_import",
        status: LeadStatus.Raw,
      })),
    });
  }

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "lead.import",
    entity: "Lead",
    meta: { imported: toCreate.length, skipped, errors: errors.length },
  });

  return NextResponse.json({
    imported: toCreate.length,
    skippedDuplicates: skipped,
    errors,
  });
}
