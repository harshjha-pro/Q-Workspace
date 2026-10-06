import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf } from "../helpers/factory";
import { db, transaction } from "@/server/lib/db";
import { storeFile, readStoredFile, resolveInside } from "@/server/lib/storage";
import { writeAudit, logSensitiveView } from "@/server/audit";
import { upsertEmployeeProfile, getEmployeeProfile } from "@/server/services/employees/service";

beforeAll(resetDb);

describe("local file storage (P1-10)", () => {
  it("stores allowed files and reads them back", async () => {
    const f = await storeFile(["CL-0001", "EN-00001"], "Form 16.pdf", Buffer.from("%PDF-1.7 test"));
    expect(f.storagePath).toMatch(/^CL-0001\/EN-00001\/[0-9a-f]{24}\.pdf$/);
    expect((await readStoredFile(f.storagePath)).toString()).toContain("%PDF");
  });
  it("rejects disallowed types, spoofed content, empty and oversized files", async () => {
    await expect(storeFile(["x"], "virus.exe", Buffer.from("MZ"))).rejects.toThrow(/not allowed/);
    await expect(storeFile(["x"], "fake.pdf", Buffer.from("MZ not a pdf"))).rejects.toThrow(/does not look like/);
    await expect(storeFile(["x"], "empty.csv", Buffer.alloc(0))).rejects.toThrow(/empty/);
    await expect(storeFile(["x"], "big.txt", Buffer.alloc(20, 65), 10)).rejects.toThrow(/larger/);
  });
  it("blocks path traversal", () => {
    expect(() => resolveInside("../../etc/passwd")).toThrow(/Invalid file path/);
  });
});

describe("audit trail (P1-05) and sensitive views (P1-09)", () => {
  it("stores only changed fields and redacts secrets", async () => {
    const u = await makeUser("PARTNER");
    await transaction((tx) =>
      writeAudit(tx, actorOf(u), {
        entityType: "Thing", entityId: "t1", action: "UPDATE",
        before: { name: "A", same: 1, passwordHash: "x", bankAccountEnc: "v1:..." },
        after: { name: "B", same: 1, passwordHash: "y", bankAccountEnc: "v1:,,," },
      }),
    );
    const row = await db().auditLog.findFirstOrThrow({ where: { entityId: "t1" } });
    expect(JSON.parse(row.afterJson!)).toEqual({ name: "B" });
    expect(row.actorUserId).toBe(u.id);
  });

  it("employee PII is encrypted at rest, masked for Managers and logged when HR views it", async () => {
    const hr = await makeUser("HR_ADMIN");
    const m = await makeUser("MANAGER");
    const s = await makeUser("STAFF", { reportingManagerId: m.id });
    await upsertEmployeeProfile(actorOf(hr), s.id, { pan: "abcpd1234e", aadhaar: "234567890123", bankAccount: "123456789012", bankIfsc: "HDFC0001234" });
    const raw = await db().employeeProfile.findUniqueOrThrow({ where: { userId: s.id } });
    expect(raw.panEnc).toMatch(/^v1:/);
    expect(JSON.stringify(raw)).not.toContain("234567890123");

    const asHr = await getEmployeeProfile(actorOf(hr), s.id);
    expect(asHr?.pan).toBe("ABCPD1234E");
    expect(asHr?.aadhaarMasked).toBe("XXXX XXXX 0123");
    expect(await db().sensitiveViewLog.count({ where: { actorUserId: hr.id, kind: "SALARY" } })).toBe(1);

    const asManager = await getEmployeeProfile(actorOf(m), s.id);
    expect(asManager?.pan).toBeNull();
    expect(asManager?.bankAccount).toBeNull();

    const asSelf = await getEmployeeProfile(actorOf(s), s.id);
    expect(asSelf?.bankAccount).toBe("123456789012");

    const other = await makeUser("STAFF");
    await expect(getEmployeeProfile(actorOf(other), s.id)).rejects.toThrow(/access/);
    await expect(upsertEmployeeProfile(actorOf(m), s.id, {})).rejects.toThrow(/access/);
  });

  it("everyone can read their own record, even roles without HR scope", async () => {
    const hr = await makeUser("HR_ADMIN");
    const pa = await makeUser("PRACTICE_ADMIN");
    await upsertEmployeeProfile(actorOf(hr), pa.id, { pan: "ABCPD1234E" });
    expect((await getEmployeeProfile(actorOf(pa), pa.id))?.pan).toBe("ABCPD1234E");
    const other = await makeUser("STAFF");
    await expect(getEmployeeProfile(actorOf(pa), other.id)).rejects.toThrow(/access/);
  });

  it("logSensitiveView records the viewer", async () => {
    const p = await makeUser("PARTNER");
    await logSensitiveView(actorOf(p), "CREDENTIAL", "Credential", "c1", "password");
    expect(await db().sensitiveViewLog.count({ where: { entityId: "c1" } })).toBe(1);
  });
});

describe("employee profile partial update", () => {
  it("a later update without PAN keeps the stored PAN", async () => {
    const hr = await makeUser("HR_ADMIN");
    const s = await makeUser("STAFF");
    await upsertEmployeeProfile(actorOf(hr), s.id, { pan: "ABCPD1234E", address: "Pune" });
    await upsertEmployeeProfile(actorOf(hr), s.id, { uan: "100123456789" });
    const p = await getEmployeeProfile(actorOf(hr), s.id);
    expect([p?.pan, p?.address, p?.uan]).toEqual(["ABCPD1234E", "Pune", "100123456789"]);
  });
});

describe("employee documents (P1-21)", () => {
  it("HR and the employee can download; a colleague cannot; HR views are logged", async () => {
    const { addEmployeeDocument } = await import("@/server/services/employees/service");
    const { documentForDownload } = await import("@/server/services/documents/service");
    const hr = await makeUser("HR_ADMIN");
    const emp = await makeUser("STAFF");
    const colleague = await makeUser("STAFF");
    await upsertEmployeeProfile(actorOf(hr), emp.id, {});
    const doc = await addEmployeeDocument(actorOf(emp), emp.id, { name: "pan.pdf", data: Buffer.from("%PDF-1.4 pan") }, "KYC");
    expect((await documentForDownload(actorOf(emp), doc.id)).fileName).toBe("pan.pdf");
    await documentForDownload(actorOf(hr), doc.id);
    expect(await db().sensitiveViewLog.count({ where: { entityId: doc.id, actorUserId: hr.id } })).toBe(1);
    await expect(documentForDownload(actorOf(colleague), doc.id)).rejects.toThrow(/access/);
    await expect(addEmployeeDocument(actorOf(colleague), emp.id, { name: "x.pdf", data: Buffer.from("%PDF") }, "KYC")).rejects.toThrow(/access/);
  });
});
