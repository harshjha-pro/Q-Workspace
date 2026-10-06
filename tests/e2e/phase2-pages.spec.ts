import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Every page in each role's navigation renders without an error (P2-28): the menu offers only what
 * the server allows, and each of those pages loads with the demo data.
 */
const ROLES = ["arvind.mehta", "rohan.iyer", "priya.nair", "aditya.kumar", "suresh.pillai", "lakshmi.narayanan"];

for (const username of ROLES) {
  test(`every menu page renders for ${username}`, async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "covered on desktop; mobile flows have their own tests");
    test.setTimeout(240_000);
    await login(page, username);
    const links = await page.locator("aside").first().locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(links.length).toBeGreaterThan(2);
    const failures: string[] = [];
    for (const href of [...new Set(links)]) {
      const res = await page.goto(href);
      const body = await page.locator("body").innerText();
      if (!res || res.status() >= 400 || /Application error|Something went wrong|Unhandled Runtime Error|This page couldn.t load/i.test(body) || page.url().includes("/denied")) failures.push(`${href} → ${res?.status()} ${page.url()}`);
    }
    expect(failures).toEqual([]);
  });
}
