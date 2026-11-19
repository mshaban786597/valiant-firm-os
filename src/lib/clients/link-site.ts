import { prisma } from "@/lib/prisma";
import { defaultSeverity } from "@/lib/monitoring/fingerprint";

/** "https://www.Example.com/page" → "example.com" */
export function siteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url.replace(/^sc-domain:/, "")}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * A check that just got an owning client: give its open incidents the task
 * they could not have before (one per incident, never a duplicate).
 */
export async function backfillIncidentTasks(
  organizationId: string,
  monitor: { id: string; name: string; target: string; environment: string; owner: string | null; kind: string | null; type: string; isDemo: boolean },
  clientId: string,
): Promise<number> {
  const orphans = await prisma.incident.findMany({
    where: { organizationId, monitorId: monitor.id, status: { in: ["OPEN", "ACKNOWLEDGED"] }, taskId: null },
  });
  let created = 0;
  for (const incident of orphans) {
    const task = await prisma.task.create({
      data: {
        organizationId,
        clientId,
        title: `Investigate: ${monitor.name}`,
        description: `Open incident from check "${monitor.name}" (${monitor.target}, ${monitor.environment}). ${incident.title}
First seen ${incident.firstSeenAt.toISOString()}.`,
        serviceType: "Monitoring",
        owner: monitor.owner ?? null,
        priority: defaultSeverity(monitor.kind ?? monitor.type) === "CRITICAL" ? "Critical" : "High",
        isDemo: monitor.isDemo,
      },
    });
    // Claim the incident only if it still has no task.
    const claimed = await prisma.incident.updateMany({
      where: { id: incident.id, taskId: null },
      data: { taskId: task.id, clientId },
    });
    if (claimed.count === 0) {
      await prisma.task.delete({ where: { id: task.id } }).catch(() => {});
      continue;
    }
    await prisma.incidentEvent.create({ data: { incidentId: incident.id, type: "task_created", note: task.id } });
    created += 1;
  }
  return created;
}

export interface LinkSiteResult {
  monitors: number;
  gscProperties: number;
  ga4Properties: number;
  incidents: number;
  tasksCreated: number;
}

/**
 * Attach everything already known about a website to its client: the live
 * checks, the Search Console property, the Analytics properties and any open
 * incident. Matching is by exact domain, so nothing from another site moves.
 */
export async function linkSiteToClient(input: { organizationId: string; clientId: string; websiteUrl: string }): Promise<LinkSiteResult> {
  const domain = siteDomain(input.websiteUrl);
  const out: LinkSiteResult = { monitors: 0, gscProperties: 0, ga4Properties: 0, incidents: 0, tasksCreated: 0 };
  if (!domain) return out;
  const scoped = { organizationId: input.organizationId };

  const monitors = (
    await prisma.monitor.findMany({ where: { ...scoped, isDemo: false, target: { contains: domain, mode: "insensitive" } } })
  ).filter((m) => siteDomain(m.target) === domain);
  for (const m of monitors) {
    if (m.clientId !== input.clientId) {
      await prisma.monitor.update({ where: { id: m.id }, data: { clientId: input.clientId } });
      out.monitors += 1;
    }
    const linked = await prisma.incident.updateMany({
      where: { ...scoped, monitorId: m.id, status: { in: ["OPEN", "ACKNOWLEDGED"] }, clientId: null },
      data: { clientId: input.clientId },
    });
    out.incidents += linked.count;
    out.tasksCreated += await backfillIncidentTasks(input.organizationId, m, input.clientId);
  }

  const gsc = (await prisma.gscProperty.findMany({ where: scoped, select: { id: true, siteUrl: true, clientId: true } })).filter(
    (p) => siteDomain(p.siteUrl) === domain,
  );
  for (const p of gsc) {
    if (p.clientId !== input.clientId) {
      await prisma.gscProperty.update({ where: { id: p.id }, data: { clientId: input.clientId } });
      out.gscProperties += 1;
    }
  }

  const ga4 = (
    await prisma.ga4Property.findMany({ where: scoped, select: { id: true, websiteUrl: true, clientId: true, propertyId: true, sessions28d: true } })
  ).filter((p) => siteDomain(p.websiteUrl) === domain);
  for (const p of ga4) {
    if (p.clientId !== input.clientId) {
      await prisma.ga4Property.update({ where: { id: p.id }, data: { clientId: input.clientId } });
      out.ga4Properties += 1;
    }
  }

  // The client's own main properties are set only from its main website: a
  // second website of the same client must not replace them.
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { websiteUrl: true, gscSiteUrl: true, ga4PropertyId: true },
  });
  const isMainSite = !client?.websiteUrl || siteDomain(client.websiteUrl) === domain;
  const mainGa4 = ga4.slice().sort((a, b) => b.sessions28d - a.sessions28d)[0];
  if (isMainSite) {
    await prisma.client.update({
      where: { id: input.clientId },
      data: {
        ...(gsc[0] ? { gscSiteUrl: gsc[0].siteUrl } : {}),
        ...(mainGa4 ? { ga4PropertyId: mainGa4.propertyId } : {}),
      },
    });
  }
  return out;
}
