/**
 * End-to-end check of the lead intake address against a running app.
 *
 *   npx tsx --env-file=.env scripts/intake-selftest.ts http://localhost:3001 [domain]
 *
 * Sends real HTTP requests (all marked as tests), checks what was stored, then
 * deletes the test enquiries and puts the website's intake back as it was.
 * The intake key is never printed.
 */
import { prisma } from "../src/lib/prisma";
import { newIntakeKey } from "../src/lib/site-leads/parse";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function db<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(5000);
    }
  }
  throw last;
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const base = (process.argv[2] ?? "").replace(/\/$/, "");
  const domain = process.argv[3] ?? "valiantfirm.com";
  if (!/^https?:\/\//.test(base)) throw new Error("Usage: intake-selftest http://localhost:3001 [domain]");

  const site = await db(() => prisma.site.findFirst({ where: { domain, organization: { slug: "valiant-firm" } } }));
  if (!site) throw new Error(`No registered website ${domain}`);
  const previousKey = site.intakeKey;
  const key = previousKey ?? newIntakeKey();
  if (!previousKey) await db(() => prisma.site.update({ where: { id: site.id }, data: { intakeKey: key } }));
  const url = `${base}/api/intake/${key}`;
  const started = new Date();
  const stamp = started.toISOString();

  // A dropped database connection on the server shows as a 5xx: try once more.
  const post = async (target: string, init: RequestInit) => {
    let res = await fetch(target, init);
    if (res.status >= 500) {
      await sleep(4000);
      res = await fetch(target, init);
    }
    return res;
  };
  const test = { "x-intake-test": "1" };

  try {
    console.log(`Intake self-test for ${domain} at ${base}`);
    const lead = { name: "Self Test", email: "selftest@valiantfirm.com", phone: "(850) 555-0100", message: `Self-test A ${stamp}`, page: `https://${domain}/contact` };
    const a = await post(url, { method: "POST", headers: { "content-type": "application/json", ...test }, body: JSON.stringify(lead) });
    check("JSON enquiry is accepted", a.status === 200, `HTTP ${a.status}`);
    const b = await post(url, { method: "POST", headers: { "content-type": "application/json", ...test }, body: JSON.stringify(lead) });
    check("the same enquiry sent twice is accepted", b.status === 200, `HTTP ${b.status}`);

    const form = new URLSearchParams({ "your-name": "Form Test", "your-email": "formtest@valiantfirm.com", "your-message": `Self-test C ${stamp}`, service: "Gutters" });
    const c = await post(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...test }, body: form.toString() });
    check("normal form post is accepted", c.status === 200, `HTTP ${c.status}`);

    const d = await post(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...test },
      body: JSON.stringify({ name: "Bot", email: "bot@valiantfirm.com", message: `Self-test D ${stamp}`, _gotcha: "filled" }),
    });
    check("bot submission gets the same reply as a real one", d.status === 200, `HTTP ${d.status}`);

    const e = await post(url, { method: "POST", headers: { "content-type": "application/json", ...test }, body: JSON.stringify({ name: "Nobody" }) });
    check("empty form is refused", e.status === 400, `HTTP ${e.status}`);

    const f = await post(`${base}/api/intake/${newIntakeKey()}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead) });
    check("unknown address is not found", f.status === 404, `HTTP ${f.status}`);

    const g = await post(url, { method: "POST", headers: { "content-type": "application/json", ...test }, body: JSON.stringify({ message: "x".repeat(40_000) }) });
    check("oversized request is refused", g.status === 413, `HTTP ${g.status}`);

    const own = await post(url, { method: "OPTIONS", headers: { origin: `https://${domain}` } });
    check("browser request from the website itself is allowed", own.headers.get("access-control-allow-origin") === `https://${domain}`, `HTTP ${own.status}`);
    const other = await post(url, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    check("browser request from another website is not allowed", other.headers.get("access-control-allow-origin") === null);

    const rows = await db(() =>
      prisma.siteLead.findMany({ where: { siteId: site.id, isTest: true, receivedAt: { gte: new Date(started.getTime() - 1000) } }, orderBy: { receivedAt: "asc" } }),
    );
    const mine = rows.filter((r) => (r.message ?? "").indexOf(stamp) !== -1);
    check("three enquiries were stored (the repeat was not stored twice)", mine.length === 3, `${mine.length} stored`);
    const rowA = mine.filter((r) => (r.message ?? "").indexOf("Self-test A") !== -1)[0];
    check(
      "fields were read correctly",
      !!rowA && rowA.name === "Self Test" && rowA.email === "selftest@valiantfirm.com" && rowA.pageUrl === `https://${domain}/contact` && rowA.status === "new",
    );
    const rowC = mine.filter((r) => (r.message ?? "").indexOf("Self-test C") !== -1)[0];
    check("form-builder field names were understood", !!rowC && rowC.name === "Form Test" && rowC.email === "formtest@valiantfirm.com" && JSON.stringify(rowC.fields) === '{"service":"Gutters"}');
    const rowD = mine.filter((r) => (r.message ?? "").indexOf("Self-test D") !== -1)[0];
    check("bot submission was filed as spam", !!rowD && rowD.status === "spam");
    check("all were marked as tests and tied to the right website", mine.every((r) => r.isTest && r.siteId === site.id && r.organizationId === site.organizationId));
  } finally {
    const removed = await db(() => prisma.siteLead.deleteMany({ where: { siteId: site.id, isTest: true, message: { contains: stamp } } }));
    if (!previousKey) await db(() => prisma.site.update({ where: { id: site.id }, data: { intakeKey: null } }));
    console.log(`\nCleaned up: ${removed.count} test enquiries deleted; intake for ${domain} is ${previousKey ? "left on" : "switched off again"}.`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message.slice(0, 400) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
