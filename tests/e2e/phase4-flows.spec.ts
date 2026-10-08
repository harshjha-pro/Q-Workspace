import { test, expect, type Page } from "@playwright/test";
import { login, DEMO_PASSWORD } from "./helpers";

/**
 * Phase 4 flows (4.8): the client portal end to end against the demo data. Desktop and mobile run against the
 * same database, so each uses its own seeded client with open document requests the demo seed leaves untouched.
 */
const CLIENT_BY_PROJECT: Record<string, string> = {
  desktop: "accounts@agarwalindustrieslimited.example.com",
  mobile: "accounts@bengalurudesignstudiollp.example.com",
};
const clientEmail = () => CLIENT_BY_PROJECT[test.info().project.name] ?? CLIENT_BY_PROJECT.desktop!;

async function portalLogin(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/portal/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/portal$/);
}

async function staffSignOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

test.describe.configure({ mode: "serial" });

test("portal upload → staff confirm → checklist received, and the request leaves the portal", async ({ browser }) => {
  test.setTimeout(240_000);
  const fileName = `e2e-upload-${Date.now()}.csv`;

  // Client: upload against the first open request.
  const client = await (await browser.newContext()).newPage();
  await portalLogin(client, clientEmail());
  await client.getByRole("link", { name: "Send documents" }).first().click();
  await expect(client.getByRole("heading", { name: "Send documents" })).toBeVisible();
  const card = client.locator("div.rounded-lg").filter({ hasText: "Requested" }).filter({ has: client.locator("input[type=file]") }).first();
  const label = (await card.locator("h2").first().textContent())!.trim();
  await card.locator("input[type=file]").setInputFiles({ name: fileName, mimeType: "text/csv", buffer: Buffer.from("date,amount\n2026-09-01,100\n") });
  await card.getByRole("button", { name: "Upload" }).click();
  await expect(client.getByText("Uploaded. The firm will check it and confirm.")).toBeVisible({ timeout: 30_000 });
  await expect(client.locator("div.rounded-lg").filter({ hasText: label }).getByText("Uploaded — being checked")).toBeVisible();

  // Staff (Partner): the upload is listed under Client uploads → its task shows it awaiting confirmation.
  const staff = await (await browser.newContext()).newPage();
  await login(staff, "arvind.mehta");
  await staff.goto("/portal-uploads?status=to-confirm");
  const row = staff.getByRole("row").filter({ hasText: fileName });
  await expect(row).toBeVisible();
  await row.getByRole("link").filter({ hasNotText: fileName }).first().click(); // the task link
  await expect(staff.getByText("Uploaded on the portal, awaiting staff confirmation").first()).toBeVisible();
  const item = staff.locator("li").filter({ hasText: label }).filter({ hasText: "awaiting staff confirmation" }).first();
  await item.getByRole("button", { name: "Confirm upload" }).click();
  await expect(staff.locator("li").filter({ hasText: label }).getByText("awaiting staff confirmation")).toHaveCount(0, { timeout: 20_000 });

  // The inward register has the upload; Client uploads shows it confirmed.
  await staff.goto("/portal-uploads?status=all");
  await expect(staff.getByRole("row").filter({ hasText: fileName }).getByText(/Confirmed/)).toBeVisible();
  await staffSignOut(staff);

  // Client: the request is gone.
  await client.goto("/portal/requests");
  await expect(client.locator("div.rounded-lg").filter({ hasText: label }).filter({ hasText: "being checked" })).toHaveCount(0);
});

test("invite link → set password → first sign-in; a portal session cannot open staff pages", async ({ browser }) => {
  test.setTimeout(180_000);
  const email = `e2e.${Date.now()}@client.example.com`;
  const admin = await (await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  await login(admin, "arvind.mehta");
  await admin.goto("/admin/portal-users");
  await admin.getByRole("button", { name: "Invite portal user" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.locator("select[name=clientId]").selectOption({ index: 1 });
  await dialog.locator("input[name=name]").fill("E2E Client User");
  await dialog.locator("input[name=email]").fill(email);
  await dialog.getByRole("button", { name: "Create invite link" }).click();
  const link = await dialog.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/portal\/invite\/[A-Za-z0-9_-]{43}$/);

  const invited = await (await browser.newContext()).newPage();
  await invited.goto(new URL(link).pathname);
  await expect(invited.getByRole("heading", { name: "Welcome, E2E Client User" })).toBeVisible();
  await invited.getByLabel("New password").fill("E2e-portal-2026");
  await invited.getByLabel("Repeat password").fill("E2e-portal-2026");
  await invited.getByRole("button", { name: "Save password" }).click();
  await expect(invited.getByText("Password saved. You can sign in now.")).toBeVisible();
  // The link works once.
  await invited.goto(new URL(link).pathname);
  await expect(invited.getByRole("heading", { name: "This link is no longer valid" })).toBeVisible();

  await portalLogin(invited, email, "E2e-portal-2026");
  await expect(invited.getByRole("heading", { name: "Hello, E2E Client User" })).toBeVisible();
  await invited.goto("/tasks");
  await expect(invited).toHaveURL(/\/login/);
});

test("client message → staff reply → client sees it", async ({ browser }) => {
  test.setTimeout(180_000);
  const subject = `E2E question ${Date.now()}`;
  const client = await (await browser.newContext()).newPage();
  await portalLogin(client, clientEmail());
  await client.goto("/portal/messages");
  await client.getByRole("button", { name: "New conversation" }).click();
  const d = client.getByRole("dialog");
  await d.locator("input[name=subject]").fill(subject);
  await d.locator("textarea[name=body]").fill("Is the GST return for September filed?");
  await d.getByRole("button", { name: "Send" }).click();
  await client.waitForURL(/\/portal\/messages\/[a-z0-9]+$/);
  const threadPath = new URL(client.url()).pathname.replace("/portal", "");

  const staff = await (await browser.newContext()).newPage();
  await login(staff, "arvind.mehta");
  await staff.goto("/messages?status=waiting");
  await expect(staff.getByRole("link", { name: subject })).toBeVisible();
  await staff.goto(threadPath);
  await staff.locator("textarea[name=body]").fill("Yes, filed on time. The acknowledgment is under Filings.");
  await staff.getByRole("button", { name: "Send" }).click();
  await expect(staff.getByText("Yes, filed on time.")).toBeVisible({ timeout: 20_000 });

  await client.reload();
  await expect(client.getByText("Yes, filed on time.")).toBeVisible();
});
