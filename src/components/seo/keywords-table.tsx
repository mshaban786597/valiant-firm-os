"use client";

import { DataTable, type Column } from "@/components/ui/data-table";

export type KeywordRow = {
  id: string;
  query: string;
  site: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const columns: Column<KeywordRow>[] = [
  { key: "query", header: "Query", render: (r) => <span className="font-medium">{r.query}</span> },
  { key: "site", header: "Site", render: (r) => <span className="text-muted">{r.site}</span> },
  { key: "clicks", header: "Clicks", render: (r) => r.clicks.toLocaleString() },
  { key: "impressions", header: "Impressions", render: (r) => r.impressions.toLocaleString() },
  { key: "ctr", header: "CTR", render: (r) => `${r.ctr.toFixed(1)}%` },
  { key: "position", header: "Position", render: (r) => r.position.toFixed(1) },
];

export function KeywordsTable({ rows }: { rows: KeywordRow[] }) {
  return <DataTable rows={rows} columns={columns} searchPlaceholder="Filter keywords…" />;
}
