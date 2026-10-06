import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { forbidden, notFound } from "../../lib/errors";
import { authorize, scopeOf } from "../../permissions/guards";
import { assertUserAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { encryptOpt, decryptOpt } from "../../lib/crypto";
import { nextCode } from "../../lib/codes";
import { PAN_RE, zIsoDate } from "../../domain/enums";
import { storeFile } from "../../lib/storage";

const optStr = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const optDate = zIsoDate.optional().nullable().or(z.literal("").transform(() => null));

const profileInput = z.object({
  employeeCategory: z.enum(["PARTNER", "STAFF", "ARTICLE", "ADMIN", "SUPPORT"]).default("STAFF"),
  dateOfBirth: optDate,
  gender: optStr,
  personalEmail: optStr,
  personalMobile: optStr,
  address: z.string().default(""),
  emergencyName: z.string().default(""),
  emergencyPhone: z.string().default(""),
  bankName: optStr,
  bankAccount: z.string().trim().regex(/^[0-9]{6,18}$/, "6–18 digits").optional().nullable().or(z.literal("").transform(() => null)),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC").optional().nullable().or(z.literal("").transform(() => null)),
  pan: z.string().trim().toUpperCase().regex(PAN_RE, "Invalid PAN").optional().nullable().or(z.literal("").transform(() => null)),
  aadhaar: z.string().trim().regex(/^[2-9][0-9]{11}$/, "12-digit Aadhaar").optional().nullable().or(z.literal("").transform(() => null)),
  uan: optStr,
  esiNumber: optStr,
  qualifications: z.string().default(""),
  membershipBody: z.enum(["ICAI", "ICSI", "ICMAI"]).optional().nullable(),
  membershipNo: optStr,
  joiningDate: optDate,
  confirmationDate: optDate,
  workStateCode: optStr,
});
export type ProfileInput = z.input<typeof profileInput>;

/** HR Admin, Partner and the employee see PII (bank, PAN, Aadhaar); a Manager sees the rest. */
function canSeePii(actor: Actor, userId: string) {
  if (actor.kind === "SYSTEM") return true;
  if (actor.kind !== "USER") return false;
  return actor.role === "PARTNER" || actor.role === "HR_ADMIN" || actor.userId === userId;
}

export async function getEmployeeProfile(actor: Actor, userId: string) {
  // Everyone may see their own record, whatever their role's HR scope (spec 3.3 "own").
  const self = actor.kind === "USER" && actor.userId === userId;
  if (!self) await assertUserAccess(actor, "hr.records.view", userId);
  const p = await db().employeeProfile.findUnique({
    where: { userId },
    include: { user: { select: { displayName: true, role: true, designation: true, reportingManager: { select: { displayName: true } } } }, documents: true },
  });
  if (!p) return null;
  const pii = canSeePii(actor, userId);
  if (pii && actor.kind === "USER" && actor.userId !== userId) {
    await logSensitiveView(actor, "SALARY", "EmployeeProfile", p.id, "bank/PAN/Aadhaar");
  }
  const { bankNameEnc, bankAccountEnc, bankIfscEnc, panEnc, aadhaarEnc, ...rest } = p;
  return {
    ...rest,
    canSeePii: pii,
    bankName: pii ? decryptOpt(bankNameEnc, "PII") : null,
    bankAccount: pii ? decryptOpt(bankAccountEnc, "PII") : null,
    bankIfsc: pii ? decryptOpt(bankIfscEnc, "PII") : null,
    pan: pii ? decryptOpt(panEnc, "PII") : null,
    // Aadhaar is always shown masked, even to HR (spec 11.1).
    aadhaarMasked: p.aadhaarLast4 ? `XXXX XXXX ${p.aadhaarLast4}` : null,
    hasAadhaar: Boolean(aadhaarEnc),
  };
}

/**
 * Create or update a profile. On update only the fields sent are changed, so an import row or
 * form that leaves PAN blank never wipes the stored PAN.
 */
export async function upsertEmployeeProfile(actor: Actor, userId: string, input: ProfileInput) {
  authorize(actor, "hr.records.manage");
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user || user.isSystem) throw notFound("User");
  const existing = await db().employeeProfile.findUnique({ where: { userId } });
  const data = (existing ? parsePartial(profileInput, input) : parse(profileInput, input)) as Partial<z.output<typeof profileInput>>;
  const { bankName, bankAccount, bankIfsc, pan, aadhaar, ...plain } = data;
  const enc: Record<string, string | null> = {};
  if (bankName !== undefined) enc.bankNameEnc = encryptOpt(bankName, "PII");
  if (bankAccount !== undefined) enc.bankAccountEnc = encryptOpt(bankAccount, "PII");
  if (bankIfsc !== undefined) enc.bankIfscEnc = encryptOpt(bankIfsc, "PII");
  if (pan !== undefined) enc.panEnc = encryptOpt(pan, "PII");
  if (aadhaar !== undefined) {
    enc.aadhaarEnc = encryptOpt(aadhaar, "PII");
    enc.aadhaarLast4 = aadhaar ? aadhaar.slice(-4) : null;
  }
  return transaction(async (tx) => {
    const row = existing
      ? await tx.employeeProfile.update({ where: { userId }, data: { ...plain, ...enc, updatedById: idOf(actor) } })
      : await tx.employeeProfile.create({
          data: { ...(plain as object), ...enc, userId, employeeCode: await nextCode(tx, "employee"), createdById: idOf(actor) },
        });
    await writeAudit(tx, actor, { entityType: "EmployeeProfile", entityId: row.id, action: existing ? "UPDATE" : "CREATE", before: existing, after: row });
    return row;
  });
}

/** KYC / certificate upload into the employee's private document area. */
export async function addEmployeeDocument(actor: Actor, userId: string, file: { name: string; data: Buffer }, kind: string) {
  const scope = scopeOf(actor, "hr.records.manage");
  const self = actor.kind === "USER" && actor.userId === userId;
  if (scope === "none" && !self) throw forbidden();
  const profile = await db().employeeProfile.findUnique({ where: { userId } });
  if (!profile) throw notFound("Employee profile");
  const stored = await storeFile(["_hr", profile.employeeCode], file.name, file.data);
  return transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        name: file.name,
        kind,
        sourceType: "UPLOAD",
        confidentiality: "HR",
        employeeUserId: userId,
        createdById: idOf(actor),
        versions: {
          create: { version: 1, storagePath: stored.storagePath, originalName: file.name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: idOf(actor) },
        },
      },
    });
    await tx.employeeDocument.create({ data: { employeeId: profile.id, documentId: doc.id, kind, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Document", entityId: doc.id, action: "CREATE", after: { employeeUserId: userId, kind, name: file.name } });
    return doc;
  });
}

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
