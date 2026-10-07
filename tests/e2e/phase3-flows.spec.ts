import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

/** Opens a dialog by its trigger button and returns the dialog locator. */
async function openDialog(page: Page, trigger: string) {
  await page.getByRole("button", { name: trigger, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Submits a confirm-style dialog and waits for it to close (closes only on success). */
async function confirmDialog(page: Page, trigger: string, submit = trigger) {
  const dialog = await openDialog(page, trigger);
  await dialog.getByRole("button", { name: submit, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const pdfMagic = (b: Buffer) => b.subarray(0, 4).toString("latin1");

test("CRM: lead → proposal → engagement letter → engagement (P3 CRM)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36).toUpperCase();
  const leadName = `E2E Lead ${stamp} Private Limited`;
  const pan = `AAAC${letters(1)}${digits(4)}${letters(1)}`;
  const engagementName = `E2E ITR ${stamp}`;

  // A Manager creates the lead.
  await login(page, "rohan.iyer");
  await page.goto("/crm/leads");
  const create = await openDialog(page, "New lead");
  await create.getByLabel("Name *", { exact: true }).fill(leadName);
  await create.getByLabel("Entity type", { exact: true }).selectOption("PRIVATE_COMPANY");
  await create.getByLabel("Contact person", { exact: true }).fill("Asha Verma");
  await create.getByLabel("PAN", { exact: true }).fill(pan);
  await create.getByLabel("Direct Tax", { exact: true }).check();
  await create.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/crm\/leads\/[^/?]+$/, { timeout: 30_000 });
  const leadUrl = page.url();
  await expect(page.getByRole("heading", { name: leadName })).toBeVisible();
  await expect(page.getByText("Possible duplicates")).toHaveCount(0);
  await expect(page.getByText(pan, { exact: true })).toBeVisible();

  // Move it along the pipeline.
  const stage = await openDialog(page, "Change stage");
  await stage.getByLabel("Stage", { exact: true }).selectOption("MEETING");
  await stage.getByRole("button", { name: "Save" }).click();
  await expect(stage).toBeHidden();
  await expect(page.getByText("Meeting", { exact: true }).first()).toBeVisible();

  // Proposal from a service template.
  const np = await openDialog(page, "New proposal");
  await np.getByLabel("Service template *", { exact: true }).selectOption({ label: "Income tax return (ITR)" });
  await np.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/crm\/proposals\/[^/?]+$/, { timeout: 30_000 });
  const proposalUrl = page.url();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  // Partner approval (a Manager may only approve within a configured limit).
  if (!(await page.getByRole("button", { name: "Approve", exact: true }).isVisible())) {
    await expect(page.getByText(/Awaiting approval/)).toBeVisible();
    await signOut(page);
    await login(page, "arvind.mehta");
    await page.goto(proposalUrl);
  }
  await confirmDialog(page, "Approve");
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

  await confirmDialog(page, "Mark as sent");
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();

  const decide = await openDialog(page, "Record client decision");
  await decide.getByLabel("Decision", { exact: true }).selectOption("ACCEPTED");
  await decide.getByLabel("Note", { exact: true }).fill("Accepted on call (E2E)");
  await decide.getByRole("button", { name: "Save" }).click();
  await expect(decide).toBeHidden();
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();

  // Generating redirects to the new letter.
  await confirmDialog(page, "Generate engagement letter");
  await page.waitForURL(/\/crm\/letters\/[^/?]+$/, { timeout: 30_000 });
  const letterUrl = page.url();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  await confirmDialog(page, "Mark issued");
  await expect(page.getByText("Issued", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Engagement letter" })).toBeVisible();

  // Upload the signed copy and accept.
  const accept = await openDialog(page, "Upload signed copy");
  await accept.getByLabel("Signed copy *", { exact: true }).setInputFiles({ name: "signed-letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
  await accept.getByLabel("Engagement name", { exact: true }).fill(engagementName);
  await accept.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(accept).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Signed uploaded", { exact: true }).first()).toBeVisible();

  // The lead is Won and the engagement exists with the proposal's fee.
  await page.goto(leadUrl);
  await expect(page.getByText("Won", { exact: true }).first()).toBeVisible();
  await page.goto(proposalUrl);
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await page.goto(letterUrl);
  await page.getByRole("link", { name: new RegExp(engagementName) }).click();
  await page.waitForURL(/\/engagements\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: engagementName })).toBeVisible();
  await expect(page.getByRole("link", { name: leadName })).toBeVisible();
  await expect(page.getByText(/Fixed\s*·\s*₹7,500/)).toBeVisible();
});

test("payroll run: reviewed by HR, approved by a Partner, paid, payslip PDF (P3 payroll)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  test.setTimeout(300_000);
  page.on("dialog", (d) => void d.accept());

  await login(page, "lakshmi.narayanan");
  await page.goto("/hr/payroll");
  const row = page.getByRole("row").filter({ hasText: "Salary" }).filter({ has: page.getByText("draft", { exact: true }) }).first();
  await row.getByRole("link").first().click();
  await page.waitForURL(/\/hr\/payroll\/[^/?]+$/);
  const runUrl = page.url();
  await expect(page.getByRole("heading", { name: /^Salary · / })).toBeVisible();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("reviewed", { exact: true })).toBeVisible({ timeout: 30_000 });
  // HR prepared and reviewed it: no Approve for HR.
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send back to Draft" })).toBeVisible();

  await signOut(page);
  await login(page, "arvind.mehta");
  await page.goto(runUrl);
  await expect(page.getByText("Reviewed by HR and waiting for your approval", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible({ timeout: 30_000 });
  // Only HR records payment.
  await expect(page.getByRole("button", { name: "Mark paid" })).toHaveCount(0);

  await signOut(page);
  await login(page, "lakshmi.narayanan");
  await page.goto(runUrl);
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("paid", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Lock" })).toBeVisible();

  const href = await page.getByRole("table").getByRole("link", { name: "PDF", exact: true }).first().getAttribute("href");
  expect(href).toMatch(/^\/api\/payroll\/payslip\//);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(pdfMagic(await res.body())).toBe("%PDF");
});

test("invoice issued, part then full receipt with TDS (P3 billing)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36).toUpperCase();

  await login(page, "arvind.mehta");
  await page.goto("/billing/invoices/new");
  await page.getByLabel("Client *").selectOption({ index: 1 });
  await expect(page.getByLabel("Engagement")).toBeEnabled({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add fee line" }).click();
  await page.getByLabel("Description").fill(`E2E advisory fee ${stamp}`);
  await page.getByLabel("Rate (₹)").fill("10000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/billing\/invoices\/(?!new$)[^/?]+$/, { timeout: 30_000 });
  const invoiceUrl = page.url();
  const invoiceId = invoiceUrl.split("/").pop()!;
  await expect(page.getByRole("heading", { name: "Draft invoice" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  await confirmDialog(page, "Issue invoice", "Issue");
  const heading = page.getByRole("heading", { name: /^QI\/\d{2}-\d{2}\/\d{4}$/ });
  await expect(heading).toBeVisible({ timeout: 20_000 });
  const number = (await heading.innerText()).trim();
  await expect(page.getByText("Invoice raised", { exact: true })).toBeVisible();

  const balance = async () => {
    const row = page.locator("div.flex.justify-between").filter({ has: page.getByText("Balance", { exact: true }) });
    return (await row.locator("span").last().innerText()).trim();
  };
  const toPaise = (s: string) => Math.round(Number(s.replace(/[₹,\s]/g, "")) * 100);
  const total = toPaise(await balance());
  expect(total).toBeGreaterThan(10_000_00);

  // Part payment by NEFT.
  await page.getByRole("link", { name: "Record receipt" }).click();
  await page.waitForURL(/\/billing\/receipts\?clientId=/);
  const recordPart = async (amountRupees: string, tdsRupees: string, ref: string) => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Record receipt" }) });
    await form.getByLabel("Mode *").selectOption("NEFT");
    await form.getByLabel("Amount received (₹) *").fill(amountRupees);
    if (tdsRupees) await form.getByLabel("TDS deducted by client (₹)").fill(tdsRupees);
    await form.getByLabel("Reference").fill(ref);
    const alloc = form.getByLabel(`Allocate to ${number}`);
    await expect(alloc).toBeVisible({ timeout: 20_000 });
    await alloc.fill(String((toPaise(amountRupees) + toPaise(tdsRupees || "0")) / 100));
    await form.getByRole("button", { name: "Record receipt" }).click();
    await expect(form.getByRole("status").filter({ hasText: "Receipt recorded." })).toBeVisible({ timeout: 20_000 });
  };
  await recordPart("5000", "", `UTR${stamp}A`);
  await page.goto(invoiceUrl);
  await expect(page.getByText("Partly received", { exact: true })).toBeVisible();
  await expect(page.getByText(`UTR${stamp}A`)).toBeVisible();
  const left = toPaise(await balance());
  expect(left).toBe(total - 5000_00);

  // The rest, with 10% TDS on the fee deducted by the client.
  await page.getByRole("link", { name: "Record receipt" }).click();
  await page.waitForURL(/\/billing\/receipts\?clientId=/);
  const tds = 1000_00;
  await recordPart(((left - tds) / 100).toFixed(2), (tds / 100).toFixed(2), `UTR${stamp}B`);
  await page.goto(invoiceUrl);
  await expect(page.getByText("Fully received", { exact: true })).toBeVisible();
  expect(toPaise(await balance())).toBe(0);

  const res = await page.request.get(`/api/billing/invoices/${invoiceId}/pdf`);
  expect(res.status()).toBe(200);
  expect(pdfMagic(await res.body())).toBe("%PDF");
});
