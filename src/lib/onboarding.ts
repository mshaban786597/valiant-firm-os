import { prisma } from "@/lib/prisma";

const DEFAULT_ITEMS: { key: string; label: string; sortOrder: number }[] = [
  // Payment & welcome
  { key: "payment_confirmed", label: "Payment confirmed", sortOrder: 1 },
  { key: "contract_signed", label: "Contract / agreement signed", sortOrder: 2 },
  { key: "welcome_email_sent", label: "Welcome email sent", sortOrder: 3 },
  { key: "welcome_call_completed", label: "Welcome call completed", sortOrder: 4 },
  { key: "onboarding_form_sent", label: "Onboarding form sent", sortOrder: 5 },
  { key: "onboarding_form_received", label: "Onboarding form received", sortOrder: 6 },
  // Access grants
  { key: "gbp_access_received", label: "GBP access received", sortOrder: 7 },
  { key: "ga4_access_received", label: "GA4 access received", sortOrder: 8 },
  { key: "gsc_access_received", label: "GSC access received", sortOrder: 9 },
  { key: "google_ads_access_received", label: "Google Ads access received", sortOrder: 10 },
  { key: "website_access_received", label: "Website / CMS access received", sortOrder: 11 },
  { key: "hosting_access_received", label: "Hosting access received", sortOrder: 12 },
  { key: "social_access_received", label: "Social profiles access received", sortOrder: 13 },
  // Data collection
  { key: "brand_assets_received", label: "Brand assets received", sortOrder: 14 },
  { key: "competitors_collected", label: "Competitors collected", sortOrder: 15 },
  { key: "target_services_confirmed", label: "Target services confirmed", sortOrder: 16 },
  { key: "target_locations_confirmed", label: "Target locations confirmed", sortOrder: 17 },
  { key: "keyword_list_built", label: "Seed keyword list built", sortOrder: 18 },
  // Strategy & kickoff
  { key: "strategy_session_held", label: "Strategy session held", sortOrder: 19 },
  { key: "kickoff_call_scheduled", label: "Kickoff call scheduled", sortOrder: 20 },
  { key: "kickoff_call_completed", label: "Kickoff call completed", sortOrder: 21 },
  // Execution & delivery
  { key: "baseline_audit_started", label: "Baseline audit started", sortOrder: 22 },
  { key: "baseline_audit_delivered", label: "Baseline audit delivered", sortOrder: 23 },
  { key: "tracking_configured", label: "Rank/analytics tracking configured", sortOrder: 24 },
  { key: "first_deliverables_shipped", label: "First deliverables shipped", sortOrder: 25 },
  { key: "first_report_sent", label: "First monthly report sent", sortOrder: 26 },
];

export { DEFAULT_ITEMS as ONBOARDING_DEFAULT_ITEMS };

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

/**
 * Auto-progress: mark a client's onboarding item complete when related data is
 * detected (e.g. a GBP location added → gbp_access_received). No-op if the
 * client has no checklist item with that key or it is already complete.
 * Best-effort — never throws into the caller.
 */
export async function autoCompleteOnboardingItem(
  clientId: string,
  key: string,
) {
  try {
    await prisma.onboardingItem.updateMany({
      where: { clientId, key, completed: false },
      data: { completed: true, completedAt: new Date() },
    });
  } catch {
    // non-blocking
  }
}
