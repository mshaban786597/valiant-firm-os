import { requireApiOrg } from "@/lib/api-org";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/export";

export async function GET() {
  const org = await requireApiOrg();
  if (!org.ok) return org.response;

  const leads = await prisma.lead.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const csv = toCsv(leads, [
    { header: "businessName", value: (l) => l.businessName },
    { header: "niche", value: (l) => l.niche },
    { header: "city", value: (l) => l.city },
    { header: "state", value: (l) => l.state },
    { header: "email", value: (l) => l.email },
    { header: "phone", value: (l) => l.phone },
    { header: "websiteUrl", value: (l) => l.websiteUrl },
    { header: "source", value: (l) => l.source },
    { header: "leadScore", value: (l) => l.leadScore },
    { header: "status", value: (l) => l.status },
  ]);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export.csv"`,
    },
  });
}
