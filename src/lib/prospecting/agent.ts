import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  businessNameFrom,
  classifyResults,
  domainOf,
  extractEmails,
  mentionsPlace,
  siteNameFrom,
  websiteFindings,
  type SerpResult,
} from "@/lib/prospecting/rules";

/**
 * Prospecting agent: runs a local search, keeps the businesses ranking on
 * page 2 to 5, reads their public site for a contact email and verifiable
 * findings, and stores each as a lead with its evidence. It never emails
 * anyone; drafting and sending are separate, guarded steps.
 */
export interface SerpProvider {
  name: string;
  /** Ranked organic results for a query in a place, best first. */
  search(query: string, location: string): Promise<SerpResult[]>;
  /** When the results of the last search were collected, if not just now. */
  collectedAt?: () => Date | null;
}

type Env = Record<string, string | undefined>;

/** Google Programmable Search (Custom Search JSON API): 5 pages of 10 results. */
export function googleCseProvider(env: Env = process.env): SerpProvider | null {
  const key = env.GOOGLE_CSE_KEY;
  const cx = env.GOOGLE_CSE_CX;
  if (!key || !cx) return null;
  return {
    name: "google_cse",
    async search(query, location) {
      const out: SerpResult[] = [];
      for (let start = 1; start <= 41; start += 10) {
        const url =
          `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}` +
          `&q=${encodeURIComponent(`${query} ${location}`)}&start=${start}&num=10&gl=us`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`Google search returned HTTP ${res.status}`);
        const json = (await res.json()) as { items?: { link: string; title: string }[] };
        const items = json.items ?? [];
        items.forEach((it, i) => out.push({ position: start + i, url: it.link, title: it.title }));
        if (items.length < 10) break;
      }
      return out;
    },
  };
}

export interface ProspectingInput {
  organizationId: string;
  niche: string;
  keyword: string;
  city: string;
  state: string;
  provider: SerpProvider | null;
  targetId?: string | null;
  isDemo?: boolean;
  /** Our own and our clients' domains: never prospect these. */
  ownDomains?: string[];
  /** When the search results were collected, if not now (imported results). */
  observedAt?: Date;
  /** Cap on new leads per run. */
  maxNew?: number;
  /** Injected for tests; defaults to a real fetch of the business's own site. */
  fetchSite?: (url: string) => Promise<{ html: string; finalUrl: string; responseMs: number } | null>;
}

export interface ProspectingOutcome {
  runId: string;
  status: "ok" | "no_provider" | "error";
  resultsSeen: number;
  added: { leadId: string; businessName: string; domain: string; position: number; email: string | null }[];
  skipped: Record<string, number>;
  error?: string;
}

async function fetchBusinessSite(url: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "ValiantFirmProspector/1.0 (+https://valiantfirm.com)", accept: "text/html,*/*" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return { html: (await res.text()).slice(0, 800_000), finalUrl: res.url || url, responseMs: Date.now() - started };
  } catch {
    return null;
  }
}

export async function runProspecting(input: ProspectingInput): Promise<ProspectingOutcome> {
  const location = `${input.city}, ${input.state}`;
  const isDemo = input.isDemo ?? false;
  const base = {
    organizationId: input.organizationId,
    targetId: input.targetId ?? null,
    query: input.keyword,
    location,
    isDemo,
  };

  if (!input.provider) {
    const run = await prisma.prospectingRun.create({
      data: { ...base, provider: "none", status: "no_provider", error: "No search provider is connected" },
    });
    return { runId: run.id, status: "no_provider", resultsSeen: 0, added: [], skipped: {}, error: "No search provider is connected" };
  }

  let results: SerpResult[];
  try {
    results = await input.provider.search(input.keyword, location);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Search failed";
    const run = await prisma.prospectingRun.create({ data: { ...base, provider: input.provider.name, status: "error", error } });
    return { runId: run.id, status: "error", resultsSeen: 0, added: [], skipped: {}, error };
  }

  // Never prospect our own sites, our clients, or a business we already have.
  const [leads, clients, properties] = await Promise.all([
    prisma.lead.findMany({ where: { organizationId: input.organizationId }, select: { websiteUrl: true } }),
    prisma.client.findMany({ where: { organizationId: input.organizationId }, select: { websiteUrl: true } }),
    prisma.gscProperty.findMany({ where: { organizationId: input.organizationId }, select: { siteUrl: true } }),
  ]);
  const toDomains = (urls: (string | null)[]) =>
    urls.map((u) => (u ? domainOf(u.replace(/^sc-domain:/, "")) : null)).filter((d): d is string => !!d);
  const classified = classifyResults(results, {
    ownDomains: [...(input.ownDomains ?? []), ...toDomains(clients.map((c) => c.websiteUrl)), ...toDomains(properties.map((p) => p.siteUrl))],
    existingDomains: toDomains(leads.map((l) => l.websiteUrl)),
  });

  const skipped: Record<string, number> = {};
  classified.skipped.forEach((s) => (skipped[s.reason] = (skipped[s.reason] ?? 0) + 1));

  const fetchSite = input.fetchSite ?? fetchBusinessSite;
  const added: ProspectingOutcome["added"] = [];
  const observedAt = input.observedAt ?? input.provider.collectedAt?.() ?? new Date();

  for (const r of classified.picked.slice(0, input.maxNew ?? 15)) {
    const home = `https://${r.domain}`;
    const site = await fetchSite(home);
    if (!site) {
      skipped.site_unreachable = (skipped.site_unreachable ?? 0) + 1;
      continue;
    }
    if (!mentionsPlace(site.html, input.city)) {
      skipped.not_local = (skipped.not_local ?? 0) + 1;
      continue;
    }
    let emails = extractEmails(site.html, r.domain);
    let emailSource = home;
    if (emails.length === 0) {
      const contact = await fetchSite(`${home}/contact`);
      if (contact) {
        emails = extractEmails(contact.html, r.domain);
        emailSource = `${home}/contact`;
      }
    }
    const findings = websiteFindings(site);
    const businessName = businessNameFrom(r.title, r.domain, siteNameFrom(site.html));

    const lead = await prisma.lead.create({
      data: {
        organizationId: input.organizationId,
        isDemo,
        businessName,
        niche: input.niche,
        city: input.city,
        state: input.state,
        websiteUrl: home,
        email: emails[0] ?? null,
        source: `AI prospecting (${input.provider.name})`,
        websiteStatus: findings[0] ?? null,
        weaknessTags: findings.length ? ["website_findings"] : [],
        outreachCategory: "low_organic_rank",
        outreachAngle: null,
        status: LeadStatus.Raw,
      },
    });
    await prisma.leadEvidence.createMany({
      data: [
        {
          organizationId: input.organizationId,
          leadId: lead.id,
          kind: "rank_observation",
          provider: input.provider.name,
          surface: "organic",
          query: input.keyword,
          location,
          depth: results.length,
          position: r.position,
          url: r.url,
          finding: `Ranks #${r.position} on Google for "${input.keyword}" in ${location}`,
          isFixture: isDemo,
          observedAt,
        },
        ...findings.map((f) => ({
          organizationId: input.organizationId,
          leadId: lead.id,
          kind: "website_finding",
          provider: "site_check",
          surface: "site",
          url: site.finalUrl,
          finding: f,
          isFixture: isDemo,
          observedAt,
        })),
        ...(emails[0]
          ? [
              {
                organizationId: input.organizationId,
                leadId: lead.id,
                kind: "contact_source",
                provider: "site_check",
                surface: "site",
                url: emailSource,
                finding: `Contact email ${emails[0]} is published on the business's own website`,
                isFixture: isDemo,
                observedAt,
              },
            ]
          : []),
      ],
    });
    added.push({ leadId: lead.id, businessName, domain: r.domain, position: r.position, email: emails[0] ?? null });
  }
  const handled = added.length + (skipped.site_unreachable ?? 0) + (skipped.not_local ?? 0);
  if (classified.picked.length > handled) skipped.over_run_limit = classified.picked.length - handled;

  const run = await prisma.prospectingRun.create({
    data: {
      ...base,
      provider: input.provider.name,
      status: "ok",
      resultsSeen: results.length,
      added: added.length,
      skipped,
    },
  });
  if (input.targetId) {
    await prisma.prospectTarget.update({ where: { id: input.targetId }, data: { lastRunAt: new Date() } }).catch(() => {});
  }
  await writeAuditLog({
    organizationId: input.organizationId,
    action: "prospecting.run",
    entity: "ProspectingRun",
    entityId: run.id,
    meta: { query: input.keyword, location, provider: input.provider.name, added: added.length },
  });
  return { runId: run.id, status: "ok", resultsSeen: results.length, added, skipped };
}
