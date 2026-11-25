import type { CSSProperties, ReactNode } from "react";

/**
 * One look for every chart, read from the theme tokens so text stays readable
 * in both light and dark mode. The chart library's own defaults are a white
 * hover box with inherited text and a light grey highlight, which hides the
 * label on a dark page.
 */

const text: CSSProperties = { color: "var(--foreground)" };

/** Spread onto <Tooltip />. */
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--surface-solid)",
    border: "1px solid var(--card-border)",
    borderRadius: 10,
    boxShadow: "0 12px 28px -14px rgba(0, 0, 0, 0.55)",
    fontSize: 12,
    ...text,
  } satisfies CSSProperties,
  labelStyle: { ...text, fontWeight: 600, marginBottom: 2 } satisfies CSSProperties,
  itemStyle: text,
};

/** Highlight behind the hovered bar. */
export const BAR_CURSOR = { fill: "var(--card-border)" };

/** Vertical guide on a hovered line or area chart. */
export const LINE_CURSOR = { stroke: "var(--muted)", strokeWidth: 1 };

/** Axis labels. */
export const AXIS_TICK = { fontSize: 11, fill: "var(--muted)" };

/** Legend labels in the page text colour (the swatch keeps the series colour). */
export function legendText(value: ReactNode) {
  return <span style={text}>{value}</span>;
}
