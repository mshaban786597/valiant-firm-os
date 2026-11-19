/**
 * Rank tracking from observed Search Console positions, day by day.
 *
 * A query's position on a day is Google's average position for the days it
 * was shown; a day with no impressions has no position (it is not zero and
 * not "lost"). Windows are averaged weighted by impressions.
 */
export interface RankDayRow {
  query: string;
  /** YYYY-MM-DD */
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

export type RankStatus = "up" | "down" | "flat" | "new" | "lost";

export interface RankRow {
  query: string;
  /** Impression-weighted average position in the current window; null when not seen. */
  current: number | null;
  /** Same for the window before it. */
  previous: number | null;
  /** Positive = moved up (a lower position number). */
  change: number | null;
  status: RankStatus;
  best: number;
  impressions: number;
  clicks: number;
  daysSeen: number;
  /** One entry per day of the tracked range, oldest first; null = not shown that day. */
  trend: (number | null)[];
}

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function weighted(rows: RankDayRow[]): number | null {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  if (rows.length === 0) return null;
  if (impressions === 0) return rows.reduce((s, r) => s + r.position, 0) / rows.length;
  return rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions;
}

/**
 * @param end        last day with data (inclusive)
 * @param windowDays size of the current and previous comparison windows
 * @param rangeDays  number of days in the trend line
 */
export function buildRankRows(rows: RankDayRow[], end: Date, windowDays = 7, rangeDays = 28): RankRow[] {
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) days.push(ymd(new Date(endMs - i * DAY)));
  const currentFrom = ymd(new Date(endMs - (windowDays - 1) * DAY));
  const previousFrom = ymd(new Date(endMs - (2 * windowDays - 1) * DAY));
  const rangeFrom = days[0]!;
  const endDay = days[days.length - 1]!;

  const byQuery: Record<string, RankDayRow[]> = {};
  rows.forEach((r) => {
    if (r.date < rangeFrom || r.date > endDay) return;
    (byQuery[r.query] = byQuery[r.query] ?? []).push(r);
  });

  const out: RankRow[] = Object.keys(byQuery).map((query) => {
    const list = byQuery[query]!;
    const byDay: Record<string, RankDayRow> = {};
    list.forEach((r) => (byDay[r.date] = r));
    const current = weighted(list.filter((r) => r.date >= currentFrom));
    const previous = weighted(list.filter((r) => r.date >= previousFrom && r.date < currentFrom));
    const change = current !== null && previous !== null ? Math.round((previous - current) * 10) / 10 : null;
    let status: RankStatus;
    if (current === null) status = "lost";
    else if (previous === null) status = "new";
    else if (change! >= 0.5) status = "up";
    else if (change! <= -0.5) status = "down";
    else status = "flat";
    return {
      query,
      current: current === null ? null : Math.round(current * 10) / 10,
      previous: previous === null ? null : Math.round(previous * 10) / 10,
      change,
      status,
      best: Math.round(Math.min.apply(null, list.map((r) => r.position)) * 10) / 10,
      impressions: list.reduce((s, r) => s + r.impressions, 0),
      clicks: list.reduce((s, r) => s + r.clicks, 0),
      daysSeen: list.length,
      trend: days.map((d) => (byDay[d] ? Math.round(byDay[d]!.position * 10) / 10 : null)),
    };
  });

  // Ranking now first (best position first), then queries no longer seen.
  return out.sort((a, b) => {
    if (a.current === null && b.current === null) return b.impressions - a.impressions;
    if (a.current === null) return 1;
    if (b.current === null) return -1;
    return a.current - b.current || b.impressions - a.impressions;
  });
}

export interface RankSummary {
  tracked: number;
  rankingNow: number;
  top3: number;
  page1: number;
  improved: number;
  declined: number;
  newlySeen: number;
  notSeen: number;
}

export function summarizeRanks(rows: RankRow[]): RankSummary {
  const now = rows.filter((r) => r.current !== null);
  const count = (s: RankStatus) => rows.filter((r) => r.status === s).length;
  return {
    tracked: rows.length,
    rankingNow: now.length,
    top3: now.filter((r) => r.current! <= 3).length,
    page1: now.filter((r) => r.current! <= 10).length,
    improved: count("up"),
    declined: count("down"),
    newlySeen: count("new"),
    notSeen: count("lost"),
  };
}

export type RankFilter = "all" | "top10" | "up" | "down" | "new" | "lost";

export function filterRanks(rows: RankRow[], filter: RankFilter): RankRow[] {
  if (filter === "top10") return rows.filter((r) => r.current !== null && r.current <= 10);
  if (filter === "all") return rows;
  return rows.filter((r) => r.status === filter);
}

/**
 * Points for a small trend line. Position 1 is drawn at the top; gaps (days
 * not shown) break the line. Returns SVG polyline point strings.
 */
export function trendSegments(trend: (number | null)[], width = 96, height = 24): string[] {
  const values = trend.filter((v): v is number => v !== null);
  if (values.length === 0) return [];
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const span = Math.max(1, max - min);
  const step = trend.length > 1 ? width / (trend.length - 1) : 0;
  const segments: string[] = [];
  let current: string[] = [];
  trend.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      return;
    }
    const x = Math.round(i * step * 10) / 10;
    const y = Math.round((2 + ((v - min) / span) * (height - 4)) * 10) / 10;
    current.push(`${x},${y}`);
  });
  if (current.length) segments.push(current.join(" "));
  return segments;
}
