import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const model = () => ({ findMany: vi.fn(async (_args?: unknown): Promise<unknown[]> => []) });
  return {
    lead: model(),
    client: model(),
    deal: model(),
    task: model(),
    report: model(),
    invoice: model(),
    contact: model(),
    campaign: model(),
    ecommerceStore: model(),
    site: model(),
    siteLead: model(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { globalSearch } from "@/lib/search";
import { getDataScope } from "@/lib/scope";

const ORG = "org-1";

beforeEach(() => {
  for (const m of Object.values(db)) m.findMany.mockReset().mockResolvedValue([]);
});

describe("header search", () => {
  it("does not touch the database for an empty or one-letter search", async () => {
    expect(await globalSearch(ORG, "  ")).toEqual({ query: "", total: 0, groups: [] });
    expect(await globalSearch(ORG, "g")).toEqual({ query: "g", total: 0, groups: [] });
    for (const m of Object.values(db)) expect(m.findMany).not.toHaveBeenCalled();
  });

  it("keeps every lookup inside the organization and leaves fixture and test rows out", async () => {
    await globalSearch(ORG, "gutter", 5);
    for (const [name, m] of Object.entries(db)) {
      const args = m.findMany.mock.calls[0]![0] as { where: Record<string, unknown>; take: number };
      expect(args.where.organizationId, name).toBe(ORG);
      expect(args.take, name).toBe(5);
    }
    for (const name of ["lead", "client", "deal", "task", "report"] as const) {
      const args = db[name].findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(args.where.isDemo, name).toBe(false);
    }
    const enquiries = db.siteLead.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(enquiries.where.isTest).toBe(false);
  });

  it("finds clients, websites and website enquiries and links each to its page", async () => {
    db.client.findMany.mockResolvedValue([{ id: "c1", businessName: "New Vision Gutters", status: "Active" }]);
    db.site.findMany.mockResolvedValue([{ id: "s1", domain: "newvisiongutters.com", name: "New Vision Gutters", kind: "client" }]);
    db.siteLead.findMany.mockResolvedValue([
      { id: "e1", name: null, email: "owner@example.com", phone: null, site: { domain: "newvisiongutters.com" } },
    ]);
    const out = await globalSearch(ORG, "gutter");
    expect(out.total).toBe(3);
    expect(out.groups.map((g) => g.type)).toEqual(["Clients", "Websites", "Leads Inbox"]);
    expect(out.groups[0]!.hits[0]).toMatchObject({ title: "New Vision Gutters", href: "/clients/c1" });
    expect(out.groups[1]!.hits[0]).toMatchObject({ title: "newvisiongutters.com", subtitle: "Client site", href: "/sites" });
    expect(out.groups[2]!.hits[0]).toMatchObject({ title: "owner@example.com", subtitle: "newvisiongutters.com", href: "/inbox" });
  });
});

describe("live data only", () => {
  it("has one scope, and it is live", () => {
    expect(getDataScope()).toEqual({ env: "live", isDemo: false, label: "Live data" });
  });

  it("never shows the word in the app: only the database column name remains", () => {
    const root = path.join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|css)$/.test(entry.name)) {
          fs.readFileSync(full, "utf8")
            .split(/\r?\n/)
            .forEach((line, i) => {
              if (/demo/i.test(line.replace(/isDemo/g, ""))) offenders.push(`${path.relative(root, full)}:${i + 1}`);
            });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
