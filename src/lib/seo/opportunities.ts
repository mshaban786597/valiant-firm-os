/**
 * SEO opportunity model: which page to work on, for which queries, and roughly
 * how many extra clicks it could earn.
 *
 * Inputs are observed Search Console rows (query + ranking page). Optional
 * third-party keyword metrics (monthly searches, difficulty) widen the demand
 * estimate for queries the site only shows for occasionally.
 *
 * "Potential" is an ESTIMATE, never a measurement:
 *   potential = monthly demand x average click-through at a realistic target
 *               position - clicks the page already gets
 * The click-through curve is an industry-average assumption; real results vary
 * by query, SERP features and brand.
 */
export interface QueryPageRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface KeywordMetric {
  volume: number;
  difficulty: number | null;
}

/** Average organic click-through by position 1..10 (assumption, see header). */
export const CTR_BY_POSITION = [0.28, 0.155, 0.11, 0.08, 0.06, 0.047, 0.037, 0.03, 0.025, 0.022];

export function expectedCtr(position: number): number {
  if (position <= 0) return 0;
  if (position <= 10) return CTR_BY_POSITION[Math.max(0, Math.round(position) - 1)]!;
  if (position <= 20) return 0.01;
  return 0.002;
}

export type Bucket = "defend" | "quick_win" | "striking_distance" | "long_shot";

export function bucketFor(position: number): Bucket {
  if (position <= 3.5) return "defend";
  if (position <= 10.5) return "quick_win";
  if (position <= 20.5) return "striking_distance";
  return "long_shot";
}

/** A realistic next step up, not a promise of #1. */
export function targetPosition(position: number): number {
  const b = bucketFor(position);
  if (b === "defend") return 1;
  if (b === "quick_win") return 3;
  if (b === "striking_distance") return 5;
  return 10;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  defend: "Top 3: defend",
  quick_win: "Page 1: quick win",
  striking_distance: "Page 2: striking distance",
  long_shot: "Page 3+: long shot",
};

export const BUCKET_ACTION: Record<Bucket, string> = {
  defend: "Already in the top 3. Keep the page fresh and protect its title and snippet.",
  quick_win: "Already on page 1. Tighten the title and H1 around these queries and add internal links to this page.",
  striking_distance: "On page 2. Expand the page to answer these queries fully and link to it from related pages.",
  long_shot: "Ranks deep. It needs a stronger dedicated page and links before it can compete.",
};

const EASE: Record<Bucket, number> = { quick_win: 1, striking_distance: 0.6, defend: 0.5, long_shot: 0.25 };

export interface QueryOpportunity {
  query: string;
  /** The page Google currently shows most for this query. */
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  monthlyDemand: number;
  demandSource: "search_console" | "keyword_tool";
  difficulty: number | null;
  bucket: Bucket;
  target: number;
  potentialClicks: number;
  priority: number;
}

const norm = (q: string) => q.trim().toLowerCase();

export function buildOpportunities(
  rows: QueryPageRow[],
  metrics: Record<string, KeywordMetric> = {},
  periodDays = 28,
): QueryOpportunity[] {
  const perMonth = 30 / periodDays;
  // One entry per query: its strongest page, with the query's total impressions.
  const byQuery: Record<string, { best: QueryPageRow; impressions: number; clicks: number }> = {};
  rows.forEach((r) => {
    if (r.position === null || !r.query || !r.page) return;
    const key = norm(r.query);
    const cur = byQuery[key];
    if (!cur) byQuery[key] = { best: r, impressions: r.impressions, clicks: r.clicks };
    else {
      cur.impressions += r.impressions;
      cur.clicks += r.clicks;
      if (r.impressions > cur.best.impressions) cur.best = r;
    }
  });

  const out: QueryOpportunity[] = Object.keys(byQuery).map((key) => {
    const { best, impressions, clicks } = byQuery[key]!;
    const position = best.position!;
    const metric = metrics[key];
    const observed = Math.round(impressions * perMonth);
    const useTool = !!metric && metric.volume > observed;
    const monthlyDemand = useTool ? metric!.volume : observed;
    const bucket = bucketFor(position);
    const target = targetPosition(position);
    const potentialClicks = Math.max(0, Math.round(monthlyDemand * expectedCtr(target) - clicks * perMonth));
    const difficulty = metric?.difficulty ?? null;
    const difficultyFactor = difficulty === null ? 1 : Math.max(0.2, 1 - difficulty / 150);
    return {
      query: best.query,
      page: best.page,
      position,
      impressions,
      clicks,
      monthlyDemand,
      demandSource: useTool ? "keyword_tool" : "search_console",
      difficulty,
      bucket,
      target,
      potentialClicks,
      priority: Math.round(potentialClicks * EASE[bucket] * difficultyFactor * 100) / 100,
    };
  });
  return out.sort((a, b) => b.priority - a.priority || b.impressions - a.impressions);
}

export interface PageOpportunity {
  page: string;
  queries: number;
  impressions: number;
  clicks: number;
  potentialClicks: number;
  /** The bucket holding most of this page's potential. */
  bucket: Bucket;
  action: string;
  topQueries: { query: string; position: number; potentialClicks: number }[];
  priority: number;
}

/** "Which page should we rank?": opportunities rolled up by page. */
export function groupByPage(opps: QueryOpportunity[]): PageOpportunity[] {
  const map: Record<string, QueryOpportunity[]> = {};
  opps.forEach((o) => (map[o.page] = map[o.page] ?? []).push(o));
  return Object.keys(map)
    .map((page) => {
      const list = map[page]!.slice().sort((a, b) => b.priority - a.priority);
      const byBucket: Record<string, number> = {};
      list.forEach((o) => (byBucket[o.bucket] = (byBucket[o.bucket] ?? 0) + o.potentialClicks + 0.001));
      const bucket = (Object.keys(byBucket).sort((a, b) => byBucket[b]! - byBucket[a]!)[0] ?? "long_shot") as Bucket;
      return {
        page,
        queries: list.length,
        impressions: list.reduce((s, o) => s + o.impressions, 0),
        clicks: list.reduce((s, o) => s + o.clicks, 0),
        potentialClicks: list.reduce((s, o) => s + o.potentialClicks, 0),
        bucket,
        action: BUCKET_ACTION[bucket],
        topQueries: list.slice(0, 4).map((o) => ({ query: o.query, position: o.position, potentialClicks: o.potentialClicks })),
        priority: Math.round(list.reduce((s, o) => s + o.priority, 0) * 100) / 100,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.impressions - a.impressions);
}

export interface OpportunityTotals {
  queries: number;
  potentialClicks: number;
  quickWins: number;
  strikingDistance: number;
  longShots: number;
  defend: number;
}

export function opportunityTotals(opps: QueryOpportunity[]): OpportunityTotals {
  const count = (b: Bucket) => opps.filter((o) => o.bucket === b).length;
  return {
    queries: opps.length,
    potentialClicks: opps.reduce((s, o) => s + o.potentialClicks, 0),
    quickWins: count("quick_win"),
    strikingDistance: count("striking_distance"),
    longShots: count("long_shot"),
    defend: count("defend"),
  };
}

/** Keywords the tool says the domain ranks for that Search Console did not report in the period. */
export function keywordGaps(
  toolKeywords: { keyword: string; volume: number; position?: number; url?: string }[],
  gscQueries: string[],
): { keyword: string; volume: number; position?: number; url?: string }[] {
  const seen: Record<string, true> = {};
  gscQueries.forEach((q) => (seen[norm(q)] = true));
  return toolKeywords.filter((k) => !seen[norm(k.keyword)]).sort((a, b) => b.volume - a.volume);
}
