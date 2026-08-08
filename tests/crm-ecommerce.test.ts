import { describe, expect, it } from "vitest";
import {
  sampleStoreDayMetric,
  sampleStoreOrders,
  sampleStoreProducts,
} from "@/lib/integrations/sample";
import { can } from "@/lib/permissions";

describe("ecommerce sample metrics", () => {
  it("is deterministic per seed + day", () => {
    expect(sampleStoreDayMetric("store-1", 3)).toEqual(sampleStoreDayMetric("store-1", 3));
    expect(sampleStoreDayMetric("store-1", 3)).not.toEqual(sampleStoreDayMetric("store-1", 4));
  });

  it("keeps orders <= sessions and revenue = orders * AOV", () => {
    for (let d = 0; d < 30; d++) {
      const m = sampleStoreDayMetric("acme-shop", d);
      expect(m.orders).toBeLessThanOrEqual(m.sessions);
      expect(m.units).toBeGreaterThanOrEqual(m.orders);
      if (m.orders > 0) expect(m.revenueCents % m.orders).toBe(0);
      expect(m.conversionRate).toBeGreaterThanOrEqual(0);
    }
  });

  it("generates the requested number of products and orders", () => {
    expect(sampleStoreProducts("s", 8)).toHaveLength(8);
    expect(sampleStoreOrders("s", 12)).toHaveLength(12);
    const p = sampleStoreProducts("s", 3)[0];
    expect(p.sku).toMatch(/^SKU-/);
    expect(p.priceCents).toBeGreaterThan(0);
  });

  it("order sample offsets stay within the 30-day window", () => {
    for (const o of sampleStoreOrders("shop", 20)) {
      expect(o.dayOffset).toBeGreaterThanOrEqual(0);
      expect(o.dayOffset).toBeLessThanOrEqual(29);
      expect(o.itemCount).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("CRM + ecommerce RBAC", () => {
  it("grants writes to the right roles and denies VIEWER", () => {
    expect(can("SALES", "contact.write")).toBe(true);
    expect(can("MANAGER", "campaign.write")).toBe(true);
    expect(can("MANAGER", "ecommerce.write")).toBe(true);
    expect(can("OPS", "ecommerce.write")).toBe(true);
    expect(can("ADS_SPECIALIST", "campaign.write")).toBe(true);
    expect(can("VIEWER", "contact.write")).toBe(false);
    expect(can("VIEWER", "campaign.write")).toBe(false);
    expect(can("VIEWER", "ecommerce.write")).toBe(false);
    // reads available to everyone
    expect(can("VIEWER", "contact.read")).toBe(true);
    expect(can("VIEWER", "ecommerce.read")).toBe(true);
  });
});
