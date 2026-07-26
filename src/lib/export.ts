/**
 * Minimal, dependency-free CSV serialization (RFC 4180). Values containing a
 * comma, quote, or newline are wrapped in quotes with quotes doubled.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCsvValue(c.value(row))).join(","),
  );
  return [header, ...body].join("\r\n");
}
