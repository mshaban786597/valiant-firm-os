/**
 * Run the full website check suite against a URL and print the real results.
 * No database, no writes — a quick live proof of the monitoring probes.
 *
 *   npm run check:site -- https://example.com
 */
import { MonitorType } from "@prisma/client";
import { WEBSITE_SUITE, normalizeSiteUrl } from "@/lib/monitoring/analyzers";
import { runMonitorCheck } from "@/lib/monitoring/runner";

async function main() {
  const url = normalizeSiteUrl(process.argv[2] ?? "");
  if (!url) {
    console.error("Usage: npm run check:site -- https://example.com");
    process.exitCode = 1;
    return;
  }
  console.log(`\nLive checks for ${url}\n`);
  const results = await Promise.all(
    WEBSITE_SUITE.map(async (s) => {
      const r = await runMonitorCheck({ type: s.type as MonitorType, target: url, state: null });
      return { label: s.label, status: r.status, detail: r.detail ?? "" };
    }),
  );
  results.forEach((r) => {
    const mark = r.status === "ok" ? "PASS" : r.status === "fail" ? "FAIL" : "N/A ";
    console.log(` ${mark}  ${r.label.padEnd(30)} ${r.detail}`);
  });
  console.log("");
}

main();
