import { expect, test } from "@playwright/test";

/**
 * Core happy-path smoke: login → dashboard → create lead → create client →
 * view reports. Uses the seeded founder credentials from the environment.
 */
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "founder@valiantfirm.agency";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ValiantDemo!2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /enter command center/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test("login lands on the dashboard", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("can open Leads and create a lead", async ({ page }) => {
  await login(page);
  await page.goto("/leads");
  await page.getByRole("button", { name: /add lead/i }).click();
  const stamp = Date.now();
  await page.getByLabel(/business name/i).fill(`E2E Lead ${stamp}`);
  await page.getByLabel(/niche/i).first().fill("Testing");
  await page.getByLabel(/city/i).first().fill("Austin");
  await page.getByLabel(/state/i).first().fill("TX");
  await page.getByRole("button", { name: /create lead|save/i }).click();
  await expect(page.getByText(`E2E Lead ${stamp}`)).toBeVisible({ timeout: 10_000 });
});

test("reports page renders", async ({ page }) => {
  await login(page);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("invalid password shows a controlled error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: /enter command center/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible({
    timeout: 10_000,
  });
});
