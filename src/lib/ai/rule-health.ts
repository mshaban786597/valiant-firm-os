import type { HealthRiskOutput } from "@/lib/schemas/health-risk";

function bandFromScore(score: number): HealthRiskOutput["band"] {
  if (score >= 80) return "Green";
  if (score >= 60) return "Yellow";
  if (score >= 40) return "Orange";
  return "Red";
}

export function ruleHealthRiskFromSignals(
  clientName: string,
  signals: {
    rank_trend: number;
    response_time: number;
    payment_history: number;
    report_engagement: number;
    nps: number;
    goal_progress: number;
  },
): HealthRiskOutput {
  const composite =
    signals.rank_trend +
    signals.response_time +
    signals.payment_history +
    signals.report_engagement +
    signals.nps +
    signals.goal_progress;

  const band = bandFromScore(composite);

  const shortName = clientName.split(" ")[0] ?? "there";

  return {
    band,
    composite_score: composite,
    rank_trend_pts: signals.rank_trend,
    response_pts: signals.response_time,
    payment_pts: signals.payment_history,
    engagement_pts: signals.report_engagement,
    nps_pts: signals.nps,
    goal_pts: signals.goal_progress,
    retention_summary: `${clientName} reads ${band} health at ${composite}/100 — intervene early if Orange/Red.`,
    check_in_email: `Hi ${shortName}, wanted to share a tight recap of progress and confirm priorities for the next 30 days. Do you have 15 minutes this week for a quick alignment call?`,
  };
}
