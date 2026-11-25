/**
 * Write the environment file for a hosted copy of the app, from the local .env.
 *
 *   node scripts/export-host-env.js https://app.example.com
 *
 * Creates .env.hostinger.local (ignored by git) with every setting that has a
 * value, the public address set to the one given, and the one-time founder
 * password left out. Prints setting NAMES only, never values.
 */
const fs = require("fs");

const appUrl = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl)) {
  console.error("Usage: node scripts/export-host-env.js https://app.example.com");
  process.exit(1);
}

const SKIP = { SEED_ADMIN_PASSWORD: true, VERCEL_OIDC_TOKEN: true };
const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
const out = [];
const kept = [];
const empty = [];
let sawUrl = false;

for (const line of lines) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
  if (!m) continue; // comments and blank lines are not needed on the host
  const key = m[1];
  let value = m[2].replace(/\s+#.*$/, (c) => (/^\s*["'].*["']\s*#/.test(m[2]) ? "" : c)).trim();
  if (SKIP[key]) continue;
  const bare = value.replace(/^["']|["']$/g, "");
  if (!bare) {
    empty.push(key);
    continue;
  }
  if (key === "NEXTAUTH_URL") {
    value = `"${appUrl}"`;
    sawUrl = true;
  }
  out.push(`${key}=${value}`);
  kept.push(key);
}
if (!sawUrl) {
  out.push(`NEXTAUTH_URL="${appUrl}"`);
  kept.push("NEXTAUTH_URL");
}

fs.writeFileSync(".env.hostinger.local", out.join("\n") + "\n");
console.log(`Wrote .env.hostinger.local with ${kept.length} settings:`);
console.log("  " + kept.join(", "));
console.log(`Left out (no value locally): ${empty.join(", ") || "none"}`);
console.log(`NEXTAUTH_URL is set to ${appUrl}`);
