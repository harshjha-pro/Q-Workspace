import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { renderTemplateFor } from "@/server/documents/library";
import {
  createTemplate, saveDraft, approveVersion, retireVersion, previewTemplate, generateFromTemplate, listTemplates, getTemplate, generatableTemplates,
} from "@/server/services/doc-templates/service";
import { DEFAULT_TEMPLATES, DRAFT_MARKER } from "@/server/services/doc-templates/defaults";
import { seedDmsReference } from "@/prisma/seed/phase3/dms";
import { searchDocuments } from "@/server/services/dms/service";

let w: Awaited<ReturnType<typeof buildWorld>>;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});

describe("template library (P3-28)", () => {
  it("managers by role: PA any category, HR only HR letters", async () => {
    await createTemplate(actorOf(w.pa), { code: "test_letter", name: "Test letter", category: "OTHER", body: "Dear {{client.name}}, re {{engagement.name}}. {{extra.topic}}" });
    await expect(createTemplate(actorOf(w.hr), { code: "HR_TEST_X", name: "Board thing", category: "BOARD_RESOLUTION" })).rejects.toThrow(/HR letter/);
    await createTemplate(actorOf(w.hr), { code: "HR_TEST_X", name: "HR test", category: "HR_LETTER", body: "Dear {{employee.name}}" });
    await expect(createTemplate(actorOf(w.m1), { code: "M_TEST", name: "Manager", category: "OTHER" })).rejects.toThrow();
    await expect(createTemplate(actorOf(w.pa), { code: "TEST_LETTER", name: "Dup", category: "OTHER" })).rejects.toThrow(/already used/);
    // HR sees HR letters only (the seeded HR_* defaults plus its own); the Practice Admin sees every category.
    const hrCodes = (await listTemplates(actorOf(w.hr))).map((t) => t.code);
    expect(hrCodes).toContain("HR_TEST_X");
    expect(hrCodes.every((c) => c.startsWith("HR_"))).toBe(true);
    const paCodes = (await listTemplates(actorOf(w.pa))).map((t) => t.code);
    expect(paCodes).toEqual(expect.arrayContaining(["HR_TEST_X", "TEST_LETTER"]));
    expect(paCodes.some((c) => !c.startsWith("HR_"))).toBe(true);
  });

  it("only a Partner approves, and only APPROVED versions are used by renderTemplateFor", async () => {
    const t = await db().template.findUniqueOrThrow({ where: { code: "TEST_LETTER" }, include: { versions: true } });
    const ctx = { clientId: w.c1.id, engagementId: w.e1.id };
    expect((await renderTemplateFor("TEST_LETTER", "FALLBACK", ctx)).text).toBe("FALLBACK");
    await expect(approveVersion(actorOf(w.pa), t.versions[0]!.id)).rejects.toThrow();
    await expect(approveVersion(actorOf(w.m1), t.versions[0]!.id)).rejects.toThrow();
    await approveVersion(actorOf(w.partner), t.versions[0]!.id);
    const r1 = await renderTemplateFor("TEST_LETTER", "FALLBACK", ctx);
    expect(r1.text).toContain(`Dear ${w.c1.name}`);
    expect(r1.templateVersionId).toBe(t.versions[0]!.id);

    // A new draft does not change generated output until it is approved.
    const v2 = await saveDraft(actorOf(w.pa), t.id, "Hello {{client.name}} v2");
    expect(v2.version).toBe(2);
    expect((await saveDraft(actorOf(w.pa), t.id, "Hello {{client.name}} v2b")).id).toBe(v2.id);
    expect((await renderTemplateFor("TEST_LETTER", "FALLBACK", ctx)).text).toContain("Dear");
    await approveVersion(actorOf(w.partner), v2.id);
    expect((await renderTemplateFor("TEST_LETTER", "FALLBACK", ctx)).text).toBe(`Hello ${w.c1.name} v2b`);
    expect((await db().templateVersion.findUniqueOrThrow({ where: { id: t.versions[0]!.id } })).status).toBe("RETIRED");
    await expect(approveVersion(actorOf(w.partner), t.versions[0]!.id)).rejects.toThrow(/Only a draft/);
    const detail = await getTemplate(actorOf(w.pa), t.id);
    expect(detail.versions.map((v) => v.status)).toEqual(["APPROVED", "RETIRED"]);
    expect(detail.versions[0]!.fields).toEqual(["client.name"]);

    await retireVersion(actorOf(w.partner), v2.id, "withdrawn");
    expect((await renderTemplateFor("TEST_LETTER", "FALLBACK", ctx)).text).toBe("FALLBACK");
  });

  it("preview reports missing merge fields and checks record access", async () => {
    const t = await db().template.findUniqueOrThrow({ where: { code: "TEST_LETTER" } });
    const p = await previewTemplate(actorOf(w.pa), { templateId: t.id, body: "Dear {{client.contactName}} of {{client.name}}, {{extra.topic}} {{employee.name}}", clientId: w.c1.id });
    expect(p.missing.sort()).toEqual(["client.contactName", "employee.name", "extra.topic"]);
    expect(p.text).toContain("[[extra.topic]]");
    const withExtra = await previewTemplate(actorOf(w.pa), { templateId: t.id, body: "{{extra.topic}}", clientId: w.c1.id, extra: { topic: "GST" } });
    expect(withExtra).toEqual({ text: "GST", missing: [] });
    const hrT = await db().template.findUniqueOrThrow({ where: { code: "HR_TEST_X" } });
    await expect(previewTemplate(actorOf(w.hr), { templateId: hrT.id, clientId: w.c1.id })).rejects.toThrow();
    expect((await previewTemplate(actorOf(w.hr), { templateId: hrT.id, userId: w.s1.id })).text).toBe(`Dear ${w.s1.displayName}`);
  });

  it("generates Word/PDF from the approved version and files it into the DMS", async () => {
    const t = await db().template.findUniqueOrThrow({ where: { code: "TEST_LETTER" } });
    await expect(generateFromTemplate(actorOf(w.s1), { code: "TEST_LETTER", clientId: w.c1.id, engagementId: w.e1.id })).rejects.toThrow(/no approved version/);
    const v3 = await saveDraft(actorOf(w.pa), t.id, "# Subject\nDear {{client.name}}\nTopic: {{extra.topic}} quokka");
    await approveVersion(actorOf(w.partner), v3.id);
    expect((await generatableTemplates(actorOf(w.s1))).map((x) => x.code)).toEqual(["TEST_LETTER"]);
    expect((await generatableTemplates(actorOf(w.s1)))[0]!.extraFields).toEqual(["topic"]);
    await expect(generateFromTemplate(actorOf(w.s2), { code: "TEST_LETTER", clientId: w.c1.id, engagementId: w.e1.id })).rejects.toThrow();
    await expect(generateFromTemplate(actorOf(w.pa), { code: "TEST_LETTER", clientId: w.c1.id })).rejects.toThrow();
    const pdf = await generateFromTemplate(actorOf(w.s1), { code: "TEST_LETTER", clientId: w.c1.id, engagementId: w.e1.id, format: "PDF" });
    expect(pdf.missing).toEqual(["extra.topic"]);
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.documentId).toBeTruthy();
    expect((await searchDocuments(actorOf(w.s1), "quokka")).map((d) => d.id)).toEqual([pdf.documentId]);
    const docx = await generateFromTemplate(actorOf(w.s1), { code: "TEST_LETTER", clientId: w.c1.id, format: "DOCX", extra: { topic: "Audit" } });
    expect(docx.fileName.endsWith(".docx")).toBe(true);
    expect(docx.missing).toEqual([]);

    // HR letters: HR / Partner only, for an employee, not filed into client folders.
    const hrT = await db().template.findUniqueOrThrow({ where: { code: "HR_TEST_X" }, include: { versions: true } });
    await approveVersion(actorOf(w.partner), hrT.versions[0]!.id);
    await expect(generateFromTemplate(actorOf(w.m1), { code: "HR_TEST_X", userId: w.s1.id })).rejects.toThrow(/HR or a Partner/);
    const letter = await generateFromTemplate(actorOf(w.hr), { code: "HR_TEST_X", userId: w.s1.id });
    expect(letter.documentId).toBeNull();
    expect(await generatableTemplates(actorOf(w.hr))).toEqual([]);
    expect((await generatableTemplates(actorOf(w.hr), "employee")).map((x) => x.code)).toEqual(["HR_TEST_X"]);
  });

  it("reference seed creates every default as a DRAFT, idempotently", async () => {
    await seedDmsReference(db());
    await seedDmsReference(db());
    const codes = DEFAULT_TEMPLATES.map((d) => d.code);
    const rows = await db().template.findMany({ where: { code: { in: codes } }, include: { versions: true } });
    expect(rows).toHaveLength(codes.length);
    expect(rows.every((r) => r.versions.length === 1 && r.versions[0]!.status === "DRAFT" && r.versions[0]!.body.startsWith(DRAFT_MARKER))).toBe(true);
    for (const sl of ["AUDIT", "ACCOUNTING", "DIRECT_TAX", "GST", "COMPANY_LAW", "ADVISORY"]) expect(codes).toContain(`ENGAGEMENT_LETTER_${sl}`);
    for (const c of ["HR_OFFER", "HR_APPOINTMENT", "HR_CONFIRMATION", "HR_INCREMENT", "HR_EXPERIENCE", "HR_RELIEVING", "RENEWAL_LETTER", "PROPOSAL"]) expect(codes).toContain(c);
    expect(await db().checklistTemplate.count({ where: { code: "QC_SQC1_AUDIT" } })).toBe(1);
  });
});
