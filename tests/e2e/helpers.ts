import type { Page } from "@playwright/test";
import { generate } from "otplib";

export const DEMO_PASSWORD = "Qepex@2026";
export const DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

/** Log in as a demo user; completes the TOTP step for roles that have it. */
export async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const totp = page.getByLabel("6-digit code from your authenticator app");
  const home = page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ });
  await Promise.race([totp.waitFor(), home.waitFor()]);
  if (await totp.isVisible()) {
    await totp.fill(await generate({ secret: DEMO_TOTP_SECRET }));
    await page.getByRole("button", { name: "Verify" }).click();
    await home.waitFor();
  }
}

/** On phones the navigation is behind the menu button. */
export async function openNav(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
}
