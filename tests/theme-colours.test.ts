import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text must stay readable in both themes. A fixed pale colour disappears on a
 * light card and a fixed deep red is dim on a dark one, so each needs a
 * counterpart for the other theme.
 */

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone";

function sourceFiles(dir = "src"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Every class-like token in the file, grouped by the quoted string it sits in. */
function classStrings(file: string): { where: string; tokens: string[] }[] {
  const out: { where: string; tokens: string[] }[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, i) => {
      // Innermost quoted strings, so a class inside `${cond ? "a" : "b"}` is judged on its own.
      for (const m of Array.from(text.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g))) {
        out.push({ where: `${file}:${i + 1}`, tokens: (m[1] ?? m[2] ?? "").split(/\s+/) });
      }
      // Template strings with the ${...} parts removed.
      for (const m of Array.from(text.matchAll(/`([^`\n]*)`/g))) {
        out.push({ where: `${file}:${i + 1}`, tokens: (m[1] ?? "").replace(/\$\{[^}]*\}/g, " ").split(/\s+/) });
      }
    });
  return out;
}

describe("colour classes work in both themes", () => {
  const strings = sourceFiles().flatMap(classStrings);

  it("pale text is only used on a dark fill or for the dark theme", () => {
    const pale = new RegExp(`^text-(${PALETTE})-(50|100|200)$`);
    const darkFill = new RegExp(`^bg-((${PALETTE})-(800|900|950)|black|valiant)(/\\d+)?$`);
    const bad = strings
      .filter((s) => s.tokens.some((t) => pale.test(t)) && !s.tokens.some((t) => darkFill.test(t)))
      .map((s) => s.where);
    expect(bad).toEqual([]);
  });

  it("deep red, green and amber text has a brighter counterpart for the dark theme", () => {
    const deep = /^(hover:)?text-(red|emerald|amber)-(600|700|800)$/;
    const bad = strings
      .filter((s) => s.tokens.some((t) => deep.test(t)) && !s.tokens.some((t) => /^dark:(hover:)?text-/.test(t)))
      .map((s) => s.where);
    expect(bad).toEqual([]);
  });

  it("small status text is not the mid-tone that is faint on a light card", () => {
    const faint = /^text-(emerald|amber)-600$/;
    const bad = strings.filter((s) => s.tokens.some((t) => faint.test(t)) && !s.where.includes("metric-visual")).map((s) => s.where);
    expect(bad).toEqual([]);
  });
});
