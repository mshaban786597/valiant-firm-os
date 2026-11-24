"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { IconChip } from "@/components/dashboard/kpi-card";
import { metricVisual } from "@/components/ui/metric-visual";
import { AXIS_TICK, BAR_CURSOR, LINE_CURSOR, TOOLTIP_STYLE, legendText } from "@/components/charts/chart-theme";

const PIE_COLORS = ["#D30404", "#2563eb", "#f97316", "#10b981", "#a855f7", "#64748b"];

export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2.5">
        <IconChip icon={metricVisual(title).icon} tone={metricVisual(title).tone} size="sm" />
        <div className="text-sm font-semibold text-foreground">{title}</div>
      </div>
      <div className="h-[260px] w-full">{children}</div>
    </div>
  );
}

export function MrrAreaChart({
  data,
}: {
  data: { month: string; mrr: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D30404" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#D30404" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} />
        <Tooltip {...TOOLTIP_STYLE} cursor={LINE_CURSOR} />
        <Area
          type="monotone"
          dataKey="mrr"
          stroke="#D30404"
          fill="url(#mrrFill)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FunnelBarChart({
  data,
}: {
  data: { stage: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis type="number" tick={AXIS_TICK} />
        <YAxis type="category" dataKey="stage" width={120} tick={AXIS_TICK} />
        <Tooltip {...TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Bar dataKey="count" fill="#2563eb" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HealthPieChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={90} label>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend formatter={legendText} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function OutreachComboChart({
  data,
}: {
  data: { label: string; sent: number; replies: number; booked: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="label" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} />
        <Tooltip {...TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Legend formatter={legendText} />
        <Bar dataKey="sent" fill="#64748b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="replies" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="booked" fill="#D30404" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TasksCompletionChart({
  data,
}: {
  data: { status: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="status" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} />
        <Tooltip {...TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Bar dataKey="count" fill="#22d3ee" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ServiceRevenueBar({
  data,
}: {
  data: { service: string; amount: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis type="number" tick={AXIS_TICK} />
        <YAxis type="category" dataKey="service" width={140} tick={AXIS_TICK} />
        <Tooltip {...TOOLTIP_STYLE} cursor={BAR_CURSOR} />
        <Bar dataKey="amount" fill="#D30404" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
