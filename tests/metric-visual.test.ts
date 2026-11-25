import { describe, expect, it } from "vitest";
import { NAV_ITEMS as ALL_NAV_ITEMS } from "@/components/layout/nav-items";
import {
  Bot,
  Briefcase,
  ClipboardCheck,
  Globe,
  Handshake,
  Radar,
  Receipt,
  ShieldAlert,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { metricVisual } from "@/components/ui/metric-visual";
import { navItemFor } from "@/components/layout/nav-items";

describe("icon for a figure", () => {
  it("picks the specific meaning over the general word inside it", () => {
    expect(metricVisual("At-risk clients")).toMatchObject({ icon: TrendingDown, tone: "alert" });
    expect(metricVisual("Active clients")).toMatchObject({ icon: Briefcase, tone: "brand" });
    expect(metricVisual("Client websites").icon).toBe(Globe);
    expect(metricVisual("Tool costs / month").icon).toBe(Receipt);
    expect(metricVisual("Rank & Rent").icon).toBe(Radar);
    expect(metricVisual("Monthly rent").icon).toBe(TrendingUp);
    expect(metricVisual("Quick wins (page 1)").icon).toBe(Target);
    expect(metricVisual("Wins").icon).toBe(Handshake);
    expect(metricVisual("Reviews").icon).toBe(Star);
    expect(metricVisual("Waiting for review").icon).toBe(ClipboardCheck);
    expect(metricVisual("AI spend (30d)").icon).toBe(Bot);
    expect(metricVisual("Users").icon).toBe(Users);
  });

  it("marks trouble and money so they read at a glance", () => {
    expect(metricVisual("Open incidents")).toMatchObject({ icon: ShieldAlert, tone: "alert" });
    expect(metricVisual("Churned MRR").tone).toBe("alert");
    expect(metricVisual("Contracted MRR").tone).toBe("money");
    expect(metricVisual("Collected (30d)").tone).toBe("money");
  });

  it("always returns an icon, even for a label it has never seen", () => {
    const v = metricVisual("Something nobody planned for");
    expect(v.icon).toBeTruthy();
    expect(v.tone).toBe("neutral");
  });
});

describe("icon for a page", () => {
  it("uses the nav entry the page belongs to, nested pages included", () => {
    expect(navItemFor("/clients")?.label).toBe("Clients");
    expect(navItemFor("/clients/abc-123")?.label).toBe("Clients");
    expect(navItemFor("/seo/keywords")?.label).toBe("SEO / GSC");
    expect(navItemFor("/search")?.label).toBe("Search");
    expect(navItemFor("/nowhere")).toBeUndefined();
  });
});

describe("navigation", () => {
  it("does not list the Content page", () => {
    expect(ALL_NAV_ITEMS.some((n) => n.href === "/content" || n.label === "Content")).toBe(false);
    expect(ALL_NAV_ITEMS.some((n) => n.href === "/gbp")).toBe(true);
    expect(ALL_NAV_ITEMS.some((n) => n.href === "/google-ads")).toBe(true);
  });
});
