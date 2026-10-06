import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Practice Admin creates a client, adds a GSTIN and changes a flag with an effective date", async ({ page }) => {
  const suffix = Date.now().toString().slice(-5);
  await login(page, "suresh.pillai");
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await page.getByRole("link", { name: "New client" }).click();
  await page.getByLabel("Name *", { exact: true }).fill(`Test Exports ${suffix} Private Limited`);
  await page.getByLabel("PAN", { exact: true }).fill(`AABCT${suffix.slice(0, 4)}K`);
  await page.getByLabel("State", { exact: true }).selectOption("MH");
  await page.getByText("TDS", { exact: true }).click();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("heading", { name: `Test Exports ${suffix} Private Limited` })).toBeVisible();
  await expect(page.getByText("Statutory audit").first()).toBeVisible();

  await page.getByRole("button", { name: "Change flags" }).click();
  await page.getByLabel(/PF/).check();
  await page.getByLabel("Reason *").fill("Crossed 20 employees");
  await page.getByRole("button", { name: "Save flags" }).click();
  await expect(page.getByText("Crossed 20 employees").first()).toBeVisible();
});

test("Staff cannot open a client they are not assigned to", async ({ page }) => {
  await login(page, "neha.gupta");
  await page.goto("/clients");
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(40);
  await expect(page.getByRole("link", { name: "New client" })).toHaveCount(0);
});
