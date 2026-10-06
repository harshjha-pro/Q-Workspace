import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Role walkthrough (brief §14): sign in as each role, open every page in that role's menu and
 * the first record on list pages, and check nothing errors. Then check that pages outside the
 * role's menu are refused.
 */
const ROLES = [
  { role: "Partner", user: "arvind.mehta", forbidden: [] as string[] },
  { role: "Manager", user: "rohan.iyer", forbidden: ["/admin/backups", "/admin/settings", "/people/new"] },
  { role: "Staff (Senior)", user: "priya.nair", forbidden: ["/people", "/admin/import", "/clients/new", "/engagements/new"] },
  { role: "Article", user: "aditya.kumar", forbidden: ["/people", "/admin/backups", "/clients/new"] },
  { role: "Practice Admin", user: "suresh.pillai", forbidden: ["/engagements/new"] },
  { role: "HR Admin", user: "lakshmi.narayanan", forbidden: ["/clients", "/engagements", "/admin/backups"] },
];

for (const r of ROLES) {
  test(`walkthrough: ${r.role}`, async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, r.user);
    const hrefs = await page.locator("aside nav a").evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
    expect(hrefs.length).toBeGreaterThan(1);
    for (const href of hrefs) {
      await page.goto(href);
      await expect(page.locator("h1").first(), `${r.role} ${href}`).toBeVisible();
      await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
      await expect(page.getByText("You do not have access to this page")).toHaveCount(0);
      // Open the first record on list pages.
      if (["/clients", "/engagements", "/people"].includes(href)) {
        const first = page.locator("tbody a").first();
        if (await first.count()) {
          await first.click();
          await expect(page.locator("h1").first()).toBeVisible();
          await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
        }
      }
    }
    for (const href of r.forbidden) {
      await page.goto(href);
      await expect(page.getByText("You do not have access to this page"), `${r.role} must not open ${href}`).toBeVisible();
    }
  });
}
