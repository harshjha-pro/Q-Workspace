import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { readStoredFile } from "@/server/lib/storage";
import { assertDocumentAccess } from "@/server/services/dms/access";
import { buildMis, listMis, previousMonth, runMonthlyMis } from "@/server/services/analytics/mis";

let w: Awaited<ReturnType<typeof buildWorld>>;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db().task.create({ data: { clientId: w.c1.id, title: "GSTR-1 Sep", periodKey: "S1", effectiveDueDate: "2026-09-11", status: "FILED", filedDate: "2026-09-10" } });
  await db().workEntry.create({ data: { userId: w.s1.id, date: "2026-09-10", clientId: w.c1.id, engagementId: w.e1.id, minutes: 90 } });
});

describe("monthly Partner MIS (P5-07)", () => {
  it("previous month rolls over the year", () => {
    expect(previousMonth("2026-10-05")).toBe("2026-09");
    expect(previousMonth("2027-01-05")).toBe("2026-12");
  });

  it("builds a PDF and an Excel workbook, files them as firm-level documents and notifies the Partners", async () => {
    const r = await buildMis(actorOf(w.partner), "2026-09", "2026-10-05");
    expect(r).toMatchObject({ month: "2026-09", label: "September 2026", version: 1 });
    const docs = await db().document.findMany({ where: { id: { in: [r.pdfDocumentId, r.xlsxDocumentId] } }, include: { versions: true, folder: true } });
    expect(docs.map((d) => d.name).sort()).toEqual(["Partner MIS Sep 2026.pdf", "Partner MIS Sep 2026.xlsx"]);
    for (const d of docs) expect(d).toMatchObject({ clientId: null, kind: "PARTNER_MIS", tagsCsv: "mis 2026-09", folder: { path: "_firm/mis" } });
    const pdf = await readStoredFile(docs.find((d) => d.name.endsWith(".pdf"))!.versions[0]!.storagePath);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await readStoredFile(docs.find((d) => d.name.endsWith(".xlsx"))!.versions[0]!.storagePath)) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(expect.arrayContaining(["Summary", "Compliance by type", "Realization", "Unbilled work", "Concentration", "CRM", "People"]));
    const summary = wb.getWorksheet("Summary")!;
    const rows = summary.getSheetValues().slice(2).map((v) => (v as unknown[]).slice(1, 4));
    expect(rows).toContainEqual(["Compliance", "Filings due in the month", "1"]);
    expect(rows).toContainEqual(["Effort", "Hours logged", "1.5 hrs"]);
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "MIS_READY", link: "/analytics/mis" } })).toBe(1);
    expect(await db().notification.count({ where: { userId: w.m1.id, kind: "MIS_READY" } })).toBe(0);
  });

  it("rebuilding adds a version; the job skips a built month and builds a missing one as System", async () => {
    const again = await buildMis(actorOf(w.partner), "2026-09", "2026-10-06");
    expect(again.version).toBe(2);
    expect(await db().documentVersion.count({ where: { documentId: again.pdfDocumentId } })).toBe(2);
    expect(await runMonthlyMis("2026-10-05")).toMatchObject({ month: "2026-09", built: false });
    expect(await runMonthlyMis("2026-11-05")).toMatchObject({ month: "2026-10", built: true });
    expect((await listMis(actorOf(w.partner))).map((m) => m.month)).toEqual(["2026-10", "2026-09"]);
  });

  it("is Partner only: building, listing and downloading", async () => {
    for (const u of [w.m1, w.pa, w.hr, w.s1]) {
      await expect(buildMis(actorOf(u), "2026-09")).rejects.toThrow(/access/);
      await expect(listMis(actorOf(u))).rejects.toThrow(/access/);
    }
    const doc = (await db().document.findFirst({ where: { kind: "PARTNER_MIS" } }))!;
    await expect(assertDocumentAccess(actorOf(w.m1), doc)).rejects.toThrow();
    await expect(assertDocumentAccess(w.portal, doc)).rejects.toThrow();
    await expect(assertDocumentAccess(actorOf(w.partner), doc)).resolves.toBeTruthy();
    await expect(buildMis(actorOf(w.partner), "2030-01", "2026-10-05")).rejects.toThrow(/not started/);
    await expect(buildMis(actorOf(w.partner), "2026-13")).rejects.toThrow(/YYYY-MM/);
  });
});
