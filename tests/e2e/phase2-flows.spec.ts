import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/** Usernames in the demo are "first.last" of the display name. */
const usernameOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ".");

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

test("daily work entry on a phone takes a few taps (P2-05)", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone flow");
  await login(page, "neha.gupta");
  await page.goto("/work");
  await page.getByLabel("Search client").fill("a");
  await page.locator("ul li button, [role=listbox] [role=option]").first().click();
  const eng = page.locator("#eng");
  await expect(eng).toBeEnabled();
  await eng.selectOption({ index: 1 });
  await page.getByRole("group", { name: "Quick time" }).getByRole("button", { name: "2h" }).click();
  await page.getByPlaceholder(/Reconciled GSTR-2B/).fill("E2E: reconciled purchase register");
  await page.getByRole("button", { name: /^Save 2 hrs?/ }).click();
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await expect(page.getByText("E2E: reconciled purchase register").first()).toBeVisible();
});

test("maker → checker → filing (P2-12, P2-13)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  test.setTimeout(180_000);
  await login(page, "priya.nair");
  const card = page.getByRole("heading", { name: "Waiting for your review" }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const review = card.locator("a[href^='/tasks/']").first();
  await review.click();
  await page.waitForURL(/\/tasks\//);
  const taskUrl = page.url();
  const maker = (await page.getByText(/^Maker:/).first().locator("..").innerText()).replace(/^Maker:\s*/, "").split("\n")[0]!;
  expect(maker).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("approved", { exact: true }).first()).toBeVisible();

  await signOut(page);
  await login(page, usernameOf(maker));
  await page.goto(taskUrl);
  await page.getByRole("button", { name: "Record filing" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Acknowledgment number").fill("AA2710260012345");
  await dialog.getByRole("button", { name: "Record filing" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Filed( late)?$/).first()).toBeVisible();
});

test("leave approval shows due-date clashes and lets the manager reassign (spec 11.3)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  await login(page, "rohan.iyer");
  await page.goto("/leave?tab=approvals");
  const card = page.locator("div").filter({ hasText: "Priya Nair" }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await expect(card.getByText(/tasks? due during this leave/)).toBeVisible();
  const first = card.getByRole("combobox", { name: /^Reassign .* to$/ }).first();
  const name = (await first.getAttribute("aria-label"))!;
  await first.selectOption({ label: "Rohan Iyer" });
  await card.getByRole("button", { name: "Reassign" }).first().click();
  // The reassigned task no longer clashes with Priya's leave.
  await expect(card.getByRole("combobox", { name, exact: true })).toHaveCount(0, { timeout: 15_000 });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("div").filter({ hasText: "Priya Nair" }).filter({ has: page.getByRole("button", { name: "Approve" }) })).toHaveCount(0, { timeout: 15_000 });
});
