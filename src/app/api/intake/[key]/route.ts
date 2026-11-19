import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telemetry } from "@/lib/telemetry";
import { receiveSiteLead } from "@/lib/site-leads/intake";
import { allowedOrigin } from "@/lib/site-leads/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 32_000;

function cors(domain: string, origin: string | null): Record<string, string> {
  const allow = allowedOrigin(domain, origin);
  return allow
    ? { "access-control-allow-origin": allow, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, x-intake-test", vary: "origin" }
    : {};
}

async function siteFor(key: string) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(key)) return null;
  return prisma.site.findUnique({
    where: { intakeKey: key },
    select: { id: true, organizationId: true, domain: true, name: true, clientId: true },
  });
}

export async function OPTIONS(req: Request, { params }: { params: { key: string } }) {
  const site = await siteFor(params.key);
  if (!site) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 204, headers: cors(site.domain, req.headers.get("origin")) });
}

/**
 * Lead intake for one website. The address itself is the secret: each site has
 * its own key, and an unknown key gets a 404. Accepts JSON or a normal form
 * post. Send header "x-intake-test: 1" to store a test enquiry that is marked
 * as a test and alerts nobody.
 */
export async function POST(req: Request, { params }: { params: { key: string } }) {
  const site = await siteFor(params.key);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const headers = cors(site.domain, req.headers.get("origin"));

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413, headers });

  let fields: Record<string, unknown> = {};
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.indexOf("application/json") !== -1) {
      const parsed = JSON.parse(raw || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        // Some form tools wrap the answers: { "fields": { ... } } or { "data": { ... } }.
        const obj = parsed as Record<string, unknown>;
        const inner = obj.fields ?? obj.data;
        fields = inner && typeof inner === "object" && !Array.isArray(inner) ? { ...obj, ...(inner as Record<string, unknown>) } : obj;
        delete fields.fields;
        delete fields.data;
      }
    } else {
      new URLSearchParams(raw).forEach((value, key) => {
        fields[key] = fields[key] === undefined ? value : `${String(fields[key])}, ${value}`;
      });
    }
  } catch {
    return NextResponse.json({ error: "Could not read the form data" }, { status: 400, headers });
  }

  const r = await receiveSiteLead({
    site,
    fields,
    source: "form_webhook",
    isTest: req.headers.get("x-intake-test") === "1",
    fallbackPageUrl: req.headers.get("referer"),
  });
  if (!r.ok) {
    if (r.reason === "rate_limited") {
      await telemetry.warn({ source: "intake", message: `Lead intake paused for ${site.domain}: too many enquiries in ten minutes` });
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
    }
    return NextResponse.json({ error: "The form was empty" }, { status: 400, headers });
  }
  // Same reply for a real lead, a repeat and a bot, so a bot learns nothing.
  return NextResponse.json({ ok: true }, { status: 200, headers });
}
