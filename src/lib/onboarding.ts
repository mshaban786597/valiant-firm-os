import { prisma } from "@/lib/prisma";

const DEFAULT_ITEMS: { key: string; label: string; sortOrder: number }[] = [
  { key: "payment_confirmed", label: "Payment confirmed", sortOrder: 1 },
  { key: "welcome_email_sent", label: "Welcome email sent", sortOrder: 2 },
  { key: "onboarding_form_sent", label: "Onboarding form sent", sortOrder: 3 },
  { key: "gbp_access_received", label: "GBP access received", sortOrder: 4 },
  { key: "ga4_access_received", label: "GA4 access received", sortOrder: 5 },
  { key: "gsc_access_received", label: "GSC access received", sortOrder: 6 },
  {
    key: "website_access_received",
    label: "Website access received",
    sortOrder: 7,
  },
  {
    key: "hosting_access_received",
    label: "Hosting access received",
    sortOrder: 8,
  },
  {
    key: "brand_assets_received",
    label: "Brand assets received",
    sortOrder: 9,
  },
  {
    key: "competitors_collected",
    label: "Competitors collected",
    sortOrder: 10,
  },
  {
    key: "target_services_confirmed",
    label: "Target services confirmed",
    sortOrder: 11,
  },
  {
    key: "target_locations_confirmed",
    label: "Target locations confirmed",
    sortOrder: 12,
  },
  {
    key: "kickoff_call_scheduled",
    label: "Kickoff call scheduled",
    sortOrder: 13,
  },
  {
    key: "baseline_audit_started",
    label: "Baseline audit started",
    sortOrder: 14,
  },
];

export async function ensureOnboardingChecklist(
  organizationId: string,
  clientId: string,
) {
  const existing = await prisma.onboardingItem.count({ where: { clientId } });
  if (existing > 0) return;

  await prisma.onboardingItem.createMany({
    data: DEFAULT_ITEMS.map((row) => ({
      organizationId,
      clientId,
      key: row.key,
      label: row.label,
      sortOrder: row.sortOrder,
      completed: false,
    })),
  });
}
