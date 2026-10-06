import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { importTemplate, validateImport, applyImport, importKindsFor } from "@/server/services/import/service";
import { gstinCheckChar } from "@/server/domain/gstin";

beforeAll(resetDb);

async function fill(template: Buffer, sheets: Record<string, (string | number)[][]>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ArrayBuffer);
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.getWorksheet(name)!;
    ws.spliceRows(2, 1); // remove the example row
    rows.forEach((r) => ws.addRow(r));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const g = (state: string, pan: string) => {
  const base = `${state}${pan}1Z`;
  return base + gstinCheckChar(base);
};

describe("Excel import (P1-16)", () => {
  it("each role sees only its import types", async () => {
    const hr = await makeUser("HR_ADMIN");
    expect(importKindsFor(actorOf(hr)).map((k) => k.kind)).toEqual(["EMPLOYEES", "SALARY_STRUCTURES", "LEAVE_BALANCES"]);
    const staff = await makeUser("STAFF");
    await expect(importTemplate(actorOf(staff), "CLIENTS")).rejects.toThrow(/access/);
    await expect(importTemplate(actorOf(hr), "CLIENTS")).rejects.toThrow(/cannot import/);
  });

  it("clients: validation report catches errors; nothing saved until a clean apply", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const t = await importTemplate(actorOf(pa), "CLIENTS");
    const flagsBlank = Array(13).fill("N");
    const bad = await fill(t.data, {
      Clients: [
        ["C1", "Nashik Agro Foods Private Limited", "PRIVATE_COMPANY", "AABCN1234F", "", "", "", "MH", "Patil Group", "", "", "", "CLIENT", "B", "2026-04-01", "Y", ...flagsBlank.slice(1), "Sanjay Patil", "s@example.com", "9876543210"],
        ["C2", "Bad Firm", "CORPORATION", "123", "", "", "", "ZZ", "", "", "", "", "", "", "", ...flagsBlank],
      ],
      GSTINs: [["C1", g("27", "AABCN1234F"), "MONTHLY", "N", "Y", "N"], ["C1", "27AABCN1234F1Z0", "WEEKLY", "Y", "N", "Y"]],
      Directors: [["C1", "01234567", "Sanjay Patil", "DIRECTOR", "2019-04-01"]],
      PT: [["C1", "MH", "27123456789P", "2026-04-01"], ["C1", "DL", "", "2026-04-01"]],
    });
    const report = await validateImport(actorOf(pa), "CLIENTS", "clients.xlsx", bad);
    expect(report.status).toBe("FAILED");
    const errorsByRow = report.rows.filter((r) => r.errors.length).map((r) => `${r.sheet}:${r.rowNumber}`);
    expect(errorsByRow).toEqual(["Clients:3", "GSTINs:3", "PT:3"]);
    expect(report.rows.find((r) => r.sheet === "Clients" && r.rowNumber === 3)!.errors.join(" ")).toMatch(/Constitution.*PAN format.*state code/);
    await expect(applyImport(actorOf(pa), report.id)).rejects.toThrow(/Fix the errors/);
    expect(await db().client.count()).toBe(0);

    const good = await fill(t.data, {
      Clients: [["C1", "Nashik Agro Foods Private Limited", "PRIVATE_COMPANY", "AABCN1234F", "", "", "", "MH", "Patil Group", "", "", "", "CLIENT", "B", "2026-04-01", "Y", ...flagsBlank.slice(1), "Sanjay Patil", "s@example.com", "9876543210"]],
      GSTINs: [["C1", g("27", "AABCN1234F"), "MONTHLY", "N", "Y", "N"]],
      Directors: [["C1", "01234567", "Sanjay Patil", "DIRECTOR", "2019-04-01"]],
      PT: [["C1", "MH", "27123456789P", "2026-04-01"]],
    });
    const ok = await validateImport(actorOf(pa), "CLIENTS", "clients.xlsx", good);
    expect(ok.status).toBe("VALIDATED");
    expect(ok.preview.join("\n")).toMatch(/1 clients, 1 GSTINs, 1 director links, 1 PT registrations/);
    const res = await applyImport(actorOf(pa), ok.id);
    expect(res.created).toBe(1);
    const c = await db().client.findFirstOrThrow({ include: { gstins: true, directors: true, ptRegistrations: true, contacts: true, group: true } });
    expect([c.gstins.length, c.directors.length, c.ptRegistrations.length, c.contacts.length]).toEqual([1, 1, 1, 1]);
    expect(c.group?.name).toBe("Patil Group");
    expect(c.tdsApplicable).toBe(true);
    expect(c.statutoryAuditApplicable).toBe(true);
    await expect(applyImport(actorOf(pa), ok.id)).rejects.toThrow(/already applied/);
  });

  it("users: returns one-time temporary passwords and links reporting managers in the same file", async () => {
    const partner = await makeUser("PARTNER");
    const t = await importTemplate(actorOf(partner), "USERS");
    const file = await fill(t.data, { Users: [["mgr.one", "Manager One", "MANAGER", "N", "", "", "", "Manager", "OFFICE", "Y"], ["staff.one", "Staff One", "STAFF", "Y", "", "", "mgr.one", "Associate", "WFH", "N"]] });
    const job = await validateImport(actorOf(partner), "USERS", "users.xlsx", file);
    expect(job.status).toBe("VALIDATED");
    const res = await applyImport(actorOf(partner), job.id);
    expect(res.tempPasswords).toHaveLength(2);
    const s = await db().user.findUniqueOrThrow({ where: { username: "staff.one" }, include: { reportingManager: true } });
    expect(s.reportingManager?.username).toBe("mgr.one");
    expect(s.isSenior).toBe(true);
    const stored = await db().importJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.summaryJson).not.toContain("Tmp-");
  });

  it("salary structures import as encrypted DRAFT rows (HR)", async () => {
    const hr = await makeUser("HR_ADMIN");
    const emp = await makeUser("STAFF");
    const t = await importTemplate(actorOf(hr), "SALARY_STRUCTURES");
    const file = await fill(t.data, { Salary: [[emp.username, "2026-04-01", "SALARY", "30,000", 12000, 8000, 0, 0, "NEW"]] });
    const job = await validateImport(actorOf(hr), "SALARY_STRUCTURES", "s.xlsx", file);
    await applyImport(actorOf(hr), job.id);
    const s = await db().salaryStructure.findFirstOrThrow({ where: { userId: emp.id } });
    expect(s.status).toBe("DRAFT");
    expect(s.componentsEnc).toMatch(/^v1:/);
    expect(s.componentsEnc).not.toContain("3000000");
  });
});
