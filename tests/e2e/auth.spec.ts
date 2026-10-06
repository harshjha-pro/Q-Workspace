import { test, expect } from "@playwright/test";
import { login, openNav, DEMO_PASSWORD } from "./helpers";

test("staff signs in with password only and sees their engagements", async ({ page }) => {
  await login(page, "priya.nair");
  await expect(page.getByText("My engagements")).toBeVisible();
  await expect(page.getByText("Staff / Senior (Senior)").first()).toBeVisible();
});

test("partner needs the authenticator code (mandatory 2FA)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("arvind.mehta");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("6-digit code from your authenticator app")).toBeVisible();
  await login(page, "arvind.mehta");
  await openNav(page);
  await expect(page.getByRole("link", { name: "Backup & restore" })).toBeVisible();
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("no.such.user"); // unknown user: same message, and no real account gets locked
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Username, password or code is not right.")).toBeVisible();
});

test("HR Admin has no client menu", async ({ page }) => {
  await login(page, "lakshmi.narayanan");
  await openNav(page);
  await expect(page.getByRole("link", { name: "Clients" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();
});
