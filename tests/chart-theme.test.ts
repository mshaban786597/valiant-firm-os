import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every .tsx file under src that draws a chart. */
function chartFiles(dir = "src"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return chartFiles(path);
    return path.endsWith(".tsx") && /from "recharts"/.test(readFileSync(path, "utf8")) ? [path] : [];
  });
}

describe("chart colours follow the theme", () => {
  const files = chartFiles();

  it("finds the chart components", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it("every hover box uses the shared theme style", () => {
    for (const file of files) {
      const tooltips = readFileSync(file, "utf8").match(/<Tooltip\b[^>]*>/g) ?? [];
      for (const tag of tooltips) expect(tag, file).toContain("{...TOOLTIP_STYLE}");
    }
  });

  it("every axis label uses the themed tick colour", () => {
    for (const file of files) {
      const axes = readFileSync(file, "utf8").match(/<[XY]Axis\b[^>]*>/g) ?? [];
      for (const tag of axes) expect(tag, file).toContain("tick={AXIS_TICK}");
    }
  });

  it("the shared style reads theme tokens, not fixed light colours", () => {
    const theme = readFileSync("src/components/charts/chart-theme.tsx", "utf8");
    expect(theme).toContain('background: "var(--surface-solid)"');
    expect(theme).toContain('color: "var(--foreground)"');
    expect(theme).toContain('fill: "var(--muted)"');
    expect(theme).not.toMatch(/#fff\b|#ffffff|"white"/i);
  });
});
