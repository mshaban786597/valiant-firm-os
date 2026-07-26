import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import type { PortalData } from "@/components/clients/client-portal-view";

/**
 * Assemble the read-only portal payload for a client from its linked GBP / GSC
 * records and latest sent report. Shared by the agency-internal preview and the
 * public token-gated portal so both render identical data.
 */
export async function buildPortalData(
  clientId: string,
  organizationId: string,
): Promise<PortalData | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: {
      businessName: true,
      status: true,
      healthScore: true,
      monthlyValue: true,
    },
  });
  if (!client) return null;

  const [gbp, gscProperty, report] = await Promise.all([
    prisma.gbpLocation.findFirst({
      where: { clientId, organizationId },
      orderBy: { reviewCount: "desc" },
      select: { rating: true, reviewCount: true, postsLast30Days: true },
    }),
    prisma.gscProperty.findFirst({
      where: { clientId, organizationId },
      orderBy: { clicks28d: "desc" },
      select: {
        clicks28d: true,
        impressions28d: true,
        avgPosition: true,
        keywords: {
          orderBy: { clicks: "desc" },
          take: 5,
          select: { query: true, position: true, clicks: true },
        },
      },
    }),
    prisma.report.findFirst({
      where: { clientId, organizationId, status: "Sent" },
      orderBy: { updatedAt: "desc" },
      select: { month: true, reportSummary: true },
    }),
  ]);

  return {
    clientName: client.businessName,
    status: client.status,
    healthScore: client.healthScore,
    monthlyValue: client.monthlyValue ? money(client.monthlyValue) : null,
    gbp: gbp
      ? { rating: gbp.rating, reviews: gbp.reviewCount, posts: gbp.postsLast30Days }
      : null,
    seo: gscProperty
      ? {
          clicks: gscProperty.clicks28d,
          impressions: gscProperty.impressions28d,
          avgPosition: gscProperty.avgPosition,
        }
      : null,
    topKeywords: gscProperty?.keywords ?? [],
    latestReport: report
      ? { title: `Report — ${report.month}`, summary: report.reportSummary }
      : null,
  };
}
