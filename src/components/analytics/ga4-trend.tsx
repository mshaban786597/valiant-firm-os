"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_TICK, LINE_CURSOR, TOOLTIP_STYLE } from "@/components/charts/chart-theme";

/** Sessions per day for one Analytics property (observed values only). */
export function Ga4Trend({ data }: { data: { date: string; sessions: number; users: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="ga4Fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D30404" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#D30404" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
        <YAxis tick={AXIS_TICK} allowDecimals={false} />
        <Tooltip {...TOOLTIP_STYLE} cursor={LINE_CURSOR} formatter={(value) => [String(value ?? ""), "Sessions"]} />
        <Area type="monotone" dataKey="sessions" stroke="#D30404" strokeWidth={2} fill="url(#ga4Fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
