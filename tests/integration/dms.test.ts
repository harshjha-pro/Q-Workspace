import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeEngagement } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { buildPdf } from "@/server/documents/pdf";
import { buildDocx } from "@/server/documents/docx";
import { documentForDownload } from "@/server/services/documents/service";
import {
  ensureFolders, uploadDocument, addVersion, checkOut, checkIn, forceRelease, searchDocuments, getDocument, documentVersionForDownload,
  fileGeneratedDocument, auditFileCompleteness, updateAuditSection, setTags, browseClients, engagementDocuments, listDocuments, updateDocument,
} from "@/server/services/dms/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
let audit: { id: string };
const txt = (s: string) => ({ name: "memo.txt", data: Buffer.from(s) });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  audit = await db().engagement.create({
    data: { code: "EN-TA0001", clientId: w.c1.id, name: "Statutory audit FY 2025-26", serviceLine: "AUDIT", engagementType: "AUDIT", feePaise: 10_000_00, partnerId: w.partner.id, managerId: w.m1.id },
  });
  await db().engagementAssignment.create({ data: { engagementId: audit.id, userId: w.s1.id, role: "MAKER", fromDate: "2026-04-01" } });
});

describe("folders (P3-26)", () => {
  it("creates client → engagement → period folders once, idempotently", async () => {
    const a = await ensureFolders(w.c1.id, w.e1.id, "FY2026-27");
    const b = await ensureFolders(w.c1.id, w.e1.id, "FY2026-27");
    expect(b.client.id).toBe(a.client.id);
    expect(b.engagement!.id).toBe(a.engagement!.id);
    expect(b.period!.id).toBe(a.period!.id);
    expect(a.period!.path).toBe(`${w.c1.code}/${w.e1.code}/FY2026-27`);
    await ensureFolders(w.c1.id);
    expect(await db().folder.count({ where: { clientId: w.c1.id, engagementId: { in: [w.e1.id] } } })).toBe(2);
    expect(await db().folder.count({ where: { clientId: w.c1.id, kind: "CLIENT" } })).toBe(1);
    await expect(ensureFolders(w.c1.id, w.e2.id)).rejects.toThrow(/another client/);
  });

  it("files generated documents into the engagement's period folder (default from its name)", async () => {
    const doc = await fileGeneratedDocument({ clientId: w.c1.id, engagementId: audit.id, name: "Notice.txt", buffer: Buffer.from("hello notice"), kind: "NOTICE", sourceType: "NOTICE", confidentiality: "NOTICE" });
    const folder = await db().folder.findUniqueOrThrow({ where: { id: doc.folderId! } });
    expect(folder.path).toBe(`${w.c1.code}/EN-TA0001/FY2025-26`);
    expect(doc.sourceType).toBe("NOTICE");
  });
});

describe("upload permissions", () => {
  it("assigned staff upload; other team, Practice Admin (read-only) and HR cannot", async () => {
    const d = await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: w.e1.id, tags: "Draft, Working Paper" }, txt("inventory valuation memo for stock count"));
    expect(d.tagsCsv).toBe("draft,working paper");
    await expect(uploadDocument(actorOf(w.s2), { clientId: w.c1.id, engagementId: w.e1.id }, txt("x"))).rejects.toThrow();
    await expect(uploadDocument(actorOf(w.pa), { clientId: w.c1.id }, txt("x"))).rejects.toThrow(/not add/);
    await expect(uploadDocument(actorOf(w.hr), { clientId: w.c1.id }, txt("x"))).rejects.toThrow();
    await expect(uploadDocument(actorOf(w.s1), { clientId: w.c1.id }, { name: "evil.exe", data: Buffer.from("MZ") })).rejects.toThrow(/not allowed/);
    await expect(uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: w.e1.id, confidentiality: "BILLING" }, txt("x"))).rejects.toThrow();
  });
});

describe("versions and check-out (P3-26)", () => {
  it("only the person who checked out can check in; Partner can force-release", async () => {
    const d = await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: w.e1.id, name: "Ledger scrutiny" }, txt("v1"));
    expect(d.name).toBe("Ledger scrutiny.txt");
    await checkOut(actorOf(w.s1), d.id);
    await expect(checkOut(actorOf(w.m1), d.id)).rejects.toThrow(/already checked/);
    await expect(addVersion(actorOf(w.m1), d.id, txt("v2 by manager"))).rejects.toThrow(/checked this document out/);
    await expect(checkIn(actorOf(w.m1), d.id)).rejects.toThrow(/Only the person/);
    await expect(forceRelease(actorOf(w.m1), d.id, "away")).rejects.toThrow(/Partner/);
    await forceRelease(actorOf(w.partner), d.id, "Priya on leave");
    expect((await db().document.findUniqueOrThrow({ where: { id: d.id } })).checkedOutById).toBeNull();

    await checkOut(actorOf(w.m1), d.id);
    await checkIn(actorOf(w.m1), d.id, { name: "ledger.txt", data: Buffer.from("v2 with debtors ageing") }, "updated");
    const after = await db().document.findUniqueOrThrow({ where: { id: d.id }, include: { versions: true } });
    expect(after.currentVersion).toBe(2);
    expect(after.versions).toHaveLength(2);
    expect(after.checkedOutById).toBeNull();
    const v1 = await documentVersionForDownload(actorOf(w.s1), d.id, 1);
    expect(v1.data.toString()).toBe("v1");
    expect(v1.fileName).toContain("(v1)");
    expect(await db().auditLog.count({ where: { entityId: d.id, action: { in: ["CHECK_OUT", "CHECK_IN", "FORCE_RELEASE", "DOWNLOAD"] } } })).toBe(5);
    // The new version's text is searchable; the old one's is not.
    expect((await searchDocuments(actorOf(w.s1), "ageing")).map((r) => r.id)).toContain(d.id);
  });
});

describe("permission-aware search (D-11)", () => {
  it("returns only documents the user may open", async () => {
    const pdf = await buildPdf({ title: "Draft financial statements", blocks: [{ type: "text", text: "Sundry debtors confirmation schedule" }] });
    const fin = await uploadDocument(actorOf(w.s2), { clientId: w.c2.id, engagementId: w.e2.id, confidentiality: "FINANCIALS", name: "FS draft" }, { name: "fs.pdf", data: pdf });
    const e3 = await makeEngagement(w.c1.id); // same client, s1 not assigned
    const other = await uploadDocument(actorOf(w.m1), { clientId: w.c1.id, engagementId: e3.id }, txt("payroll reconciliation zebra"));
    const billing = await uploadDocument(actorOf(w.m1), { clientId: w.c1.id, confidentiality: "BILLING" }, txt("fee working zebra"));
    const word = await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: w.e1.id }, { name: "letter.docx", data: await buildDocx({ title: "Letter", body: "Kangaroo clause inside Word" }) });

    expect((await searchDocuments(actorOf(w.s2), "sundry debtors")).map((r) => r.id)).toEqual([fin.id]);
    expect(await searchDocuments(actorOf(w.s1), "sundry")).toHaveLength(0);
    expect(await searchDocuments(actorOf(w.m1), "sundry")).toHaveLength(0);
    expect((await searchDocuments(actorOf(w.partner), "sund")).map((r) => r.id)).toEqual([fin.id]);
    expect((await searchDocuments(actorOf(w.pa), "sundry")).map((r) => r.id)).toEqual([fin.id]);
    await expect(searchDocuments(actorOf(w.hr), "sundry")).rejects.toThrow();

    // Staff: engagement documents only for engagements they are on; never billing.
    expect(await searchDocuments(actorOf(w.s1), "zebra")).toHaveLength(0);
    expect((await searchDocuments(actorOf(w.m1), "zebra")).map((r) => r.id).sort()).toEqual([other.id, billing.id].sort());
    await expect(getDocument(actorOf(w.s1), other.id)).rejects.toThrow();
    await expect(getDocument(actorOf(w.a1), billing.id)).rejects.toThrow();
    await expect(documentForDownload(actorOf(w.a1), billing.id)).rejects.toThrow(/confidential/);
    expect((await searchDocuments(actorOf(w.s1), "kangaroo")).map((r) => r.id)).toEqual([word.id]);

    // Tags are searchable and re-indexed on change.
    await setTags(actorOf(w.s1), word.id, ["signed", "client copy"]);
    expect((await searchDocuments(actorOf(w.s1), "signed")).map((r) => r.id)).toContain(word.id);
    expect((await browseClients(actorOf(w.s1))).map((c) => c.id)).toEqual([w.c1.id]);
    expect(await browseClients(actorOf(w.s2))).toHaveLength(1);
  });

  it("logs every view and download of FINANCIALS / NOTICE documents", async () => {
    const [fin] = await searchDocuments(actorOf(w.partner), "sundry");
    const before = await db().sensitiveViewLog.count({ where: { entityId: fin!.id, kind: "FINANCIALS" } });
    await getDocument(actorOf(w.partner), fin!.id);
    await documentVersionForDownload(actorOf(w.partner), fin!.id);
    expect(await db().sensitiveViewLog.count({ where: { entityId: fin!.id, kind: "FINANCIALS" } })).toBe(before + 2);
  });

  it("only Managers/Partners change confidentiality", async () => {
    const d = await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: w.e1.id }, txt("tb"));
    await expect(updateDocument(actorOf(w.s1), d.id, { confidentiality: "FINANCIALS" })).rejects.toThrow(/Manager or Partner/);
    await updateDocument(actorOf(w.m1), d.id, { confidentiality: "FINANCIALS" });
    expect((await listDocuments(actorOf(w.s1), { engagementId: w.e1.id })).find((r) => r.id === d.id)?.confidentiality).toBe("FINANCIALS");
  });
});

describe("audit file index (13.1)", () => {
  it("shows completeness of the standard sections", async () => {
    const c0 = await auditFileCompleteness(audit.id);
    expect(c0.applicable).toBe(true);
    expect(c0.sections.map((s) => s.code)).toEqual(["PLANNING", "RISK", "FIELDWORK", "QUERIES", "REPORTS"]);
    expect(c0.percent).toBe(0);
    expect((await auditFileCompleteness(w.e1.id)).applicable).toBe(false);
    const planning = c0.sections.find((s) => s.code === "PLANNING")!;
    await expect(updateAuditSection(actorOf(w.m1), planning.id, { complete: true })).rejects.toThrow(/at least one document/);
    await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: audit.id, auditSectionCode: "PLANNING" }, txt("audit plan"));
    await expect(updateAuditSection(actorOf(w.s1), planning.id, { complete: true })).rejects.toThrow();
    await updateAuditSection(actorOf(w.m1), planning.id, { complete: true });
    expect((await auditFileCompleteness(audit.id)).percent).toBe(20);
    await updateAuditSection(actorOf(w.partner), c0.sections.find((s) => s.code === "QUERIES")!.id, { required: false });
    expect((await auditFileCompleteness(audit.id)).percent).toBe(25);
    const view = await engagementDocuments(actorOf(w.s1), audit.id);
    expect(view.audit?.percent).toBe(25);
    expect(view.selectedPeriod).toBe("FY2025-26");
    await expect(engagementDocuments(actorOf(w.s2), audit.id)).rejects.toThrow();
    await expect(uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: w.e1.id, auditSectionCode: "PLANNING" }, txt("x"))).rejects.toThrow(/audit engagements/);
  });
});
