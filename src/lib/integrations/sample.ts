/**
 * Deterministic sample-data generators for the Google integrations
 * (GBP / GSC / Ads).
 *
 * Real syncs require OAuth credentials the agency configures per provider.
 * Until those are connected, "Refresh" actions call these pure functions so
 * dashboards render meaningful, STABLE numbers instead of being empty. Output
 * is a pure function of the seed string (no randomness), so refreshing the same
 * record twice yields identical values — safe for demos and tests.
 */

/** Small deterministic string hash (FNV-1a style), always non-negative. */
export function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic integer in [min, max] derived from seed + salt. */
function pick(seed: string, salt: string, min: number, max: number): number {
  const h = seedHash(`${seed}:${salt}`);
  return min + (h % (max - min + 1));
}

export interface GbpInsights {
  rating: number;
  reviewCount: number;
  postsLast30Days: number;
}

export function sampleGbpInsights(seed: string): GbpInsights {
  return {
    rating: 3.9 + pick(seed, "rating", 0, 10) / 10, // 3.9–4.9
    reviewCount: pick(seed, "reviews", 12, 480),
    postsLast30Days: pick(seed, "posts", 0, 16),
  };
}

export interface GscInsights {
  clicks28d: number;
  impressions28d: number;
  avgPosition: number;
  keywords: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
}

const KEYWORD_TEMPLATES = [
  "near me",
  "best {niche}",
  "{niche} {city}",
  "affordable {niche}",
  "{niche} reviews",
  "emergency {niche}",
  "{niche} quotes",
  "top rated {niche}",
];

export function sampleGscInsights(
  seed: string,
  niche = "services",
  city = "your area",
): GscInsights {
  const impressions = pick(seed, "impr", 800, 42000);
  const clicks = Math.round(impressions * (pick(seed, "ctr", 2, 9) / 100));
  const keywords = KEYWORD_TEMPLATES.map((tpl, i) => {
    const query = tpl.replace("{niche}", niche).replace("{city}", city);
    const kImpr = pick(seed, `ki${i}`, 40, 6000);
    const kClicks = Math.round(kImpr * (pick(seed, `kc${i}`, 1, 12) / 100));
    return {
      query,
      clicks: kClicks,
      impressions: kImpr,
      ctr: kImpr ? Number(((kClicks / kImpr) * 100).toFixed(2)) : 0,
      position: 1 + pick(seed, `kp${i}`, 0, 300) / 10, // 1.0–31.0
    };
  });
  return {
    clicks28d: clicks,
    impressions28d: impressions,
    avgPosition: 1 + pick(seed, "pos", 0, 250) / 10,
    keywords,
  };
}

export interface EmailEngagement {
  opens: number;
  clicks: number;
  unsubscribes: number;
}

/**
 * Deterministic engagement for a "sent" campaign when no ESP (Resend) is
 * configured. Real dispatch + webhooks would replace these numbers.
 */
export function sampleEmailEngagement(
  seed: string,
  recipientCount: number,
): EmailEngagement {
  if (recipientCount <= 0) return { opens: 0, clicks: 0, unsubscribes: 0 };
  const openRate = 28 + (seedHash(`${seed}:open`) % 34); // 28–61%
  const opens = Math.round((recipientCount * openRate) / 100);
  const clicks = Math.round((opens * (8 + (seedHash(`${seed}:click`) % 22))) / 100);
  const unsubscribes = Math.round(
    (recipientCount * (seedHash(`${seed}:unsub`) % 3)) / 100,
  );
  return { opens, clicks, unsubscribes };
}

export interface AdsMetrics {
  spend: number; // cents
  impressions: number;
  clicks: number;
  conversions: number;
  costPerConv: number | null; // cents
}

export function sampleAdsMetrics(seed: string): AdsMetrics {
  const impressions = pick(seed, "aimpr", 2000, 90000);
  const clicks = Math.round(impressions * (pick(seed, "actr", 1, 8) / 100));
  const conversions = Math.round(clicks * (pick(seed, "acvr", 3, 18) / 100));
  const spend = pick(seed, "aspend", 25000, 900000); // $250–$9,000
  return {
    spend,
    impressions,
    clicks,
    conversions,
    costPerConv: conversions > 0 ? Math.round(spend / conversions) : null,
  };
}
