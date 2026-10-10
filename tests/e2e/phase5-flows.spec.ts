import { test, expect } from "@playwright/test";
import { login, openNav } from "./helpers";

/**
 * Phase 5 flows: the analytics pages against the demo data, by role. Read-only, so desktop and mobile can share
 * the database. Checks access per the matrix, that every page renders its numbers, the timeline drill-down,
 * the MIS download and the weekly summary.
 */
test.describe.configure({ mode: "serial" });

const heading = (name: string | RegExp) => ({ role: "heading" as const, opts: { name, level: 1 } });

test("Partner: every analytics page renders, timeline drills down, MIS downloads", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, "arvind.mehta");
  const pages: [string, string][] = [
    ["/analytics/me", "My dashboard"], ["/analytics/compliance", "Compliance"], ["/analytics/engagements", "Engagements"],
    ["/analytics/timeline", "Timeline board"], ["/analytics/weekly", "Weekly summary"], ["/analytics/firm", "Firm"],
    ["/analytics/profitability", "Profitability and cash"], ["/analytics/capacity", "Capacity forecast"], ["/analytics/crm", "CRM"],
    ["/analytics/people", "People"], ["/analytics/mis", "Partner MIS"],
  ];
  for (const [path, title] of pages) {
    await page.goto(path);
    const h = heading(title);
    await expect(page.getByRole(h.role, h.opts)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  }

  // Timeline: open the first cell's drill-down and follow a task.
  await page.goto("/analytics/timeline");
  await page.locator("tbody a[aria-label]").first().click();
  const drill = page.locator("#drill");
  await expect(drill).toBeVisible();
  await drill.locator("tbody a").first().click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);

  // MIS: last month's report was built by the demo; the PDF downloads.
  await page.goto("/analytics/mis");
  const pdf = page.getByRole("link", { name: "Download PDF" }).first();
  await expect(pdf).toBeVisible();
  const res = await page.request.get((await pdf.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Weekly summary has a headline and at least one line to act on or note.
  await page.goto("/analytics/weekly");
  await expect(page.getByText(/things? to act on|Some things to watch|A steady week/)).toBeVisible();
});

test("Manager: team views and the people timeline; firm-only pages are refused", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "rohan.iyer");
  await page.goto("/analytics/compliance");
  await expect(page.getByText("your team's clients")).toBeVisible();
  await page.goto("/analytics/timeline?view=people");
  await expect(page.getByRole("columnheader", { name: "Person" })).toBeVisible();
  for (const path of ["/analytics/firm", "/analytics/profitability", "/analytics/capacity", "/analytics/mis", "/analytics/people"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/denied/);
  }
});

test("Staff see only their own dashboard; HR only People", async ({ browser }) => {
  test.setTimeout(180_000);
  const staff = await (await browser.newContext()).newPage();
  await login(staff, "neha.gupta");
  await openNav(staff);
  await expect(staff.getByRole("link", { name: "My dashboard" })).toBeVisible();
  await expect(staff.getByRole("link", { name: "Profitability" })).toHaveCount(0);
  await staff.goto("/analytics/me");
  await expect(staff.getByText("hrs", { exact: false }).first()).toBeVisible();
  for (const path of ["/analytics/compliance", "/analytics/timeline", "/analytics/weekly"]) {
    await staff.goto(path);
    await expect(staff).toHaveURL(/\/denied/);
  }
  const hr = await (await browser.newContext()).newPage();
  await login(hr, "lakshmi.narayanan");
  await hr.goto("/analytics/people");
  await expect(hr.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  await hr.goto("/analytics/crm");
  await expect(hr).toHaveURL(/\/denied/);
});
