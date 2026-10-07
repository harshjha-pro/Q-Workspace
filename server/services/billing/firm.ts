import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { isValidGstin } from "../../domain/gstin";
import { PAN_RE } from "../../domain/enums";
import { idOf, staffOnly } from "./common";

const DEFAULT_FIRM_STATE = "RJ";

const opt = (t: z.ZodType<string, string>) => t.optional().default("");
const firmInput = z.object({
  name: z.string().trim().min(2, "Enter the firm name").max(120),
  address: opt(z.string().trim().max(400)),
  stateCode: z.string().trim().toUpperCase().min(2, "Pick the state").max(3),
  gstin: opt(z.string().trim().toUpperCase().max(15)),
  pan: opt(z.string().trim().toUpperCase().max(10)),
  email: opt(z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email")),
  phone: opt(z.string().trim().max(40)),
  bankName: opt(z.string().trim().max(80)),
  bankAccount: opt(z.string().trim().regex(/^[0-9]{0,20}$/, "Digits only")),
  bankIfsc: opt(z.string().trim().toUpperCase().regex(/^$|^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC is 11 characters, e.g. HDFC0001234")),
  upiId: opt(z.string().trim().regex(/^$|^[\w.-]{2,}@[a-zA-Z]{2,}$/, "UPI ID looks like name@bank")),
  invoiceNote: opt(z.string().trim().max(600)),
});
export type FirmProfileInput = z.input<typeof firmInput>;

/** The firm's details printed on invoices. Returns an unsaved default (Rajasthan) if none exists yet. */
export async function getFirmProfile() {
  const row = await db().firmProfile.findFirst({ orderBy: { createdAt: "asc" } });
  return row ?? { id: "", name: "QEPEX India", address: "", stateCode: DEFAULT_FIRM_STATE, gstin: "", pan: "", email: "", phone: "", bankName: "", bankAccount: "", bankIfsc: "", upiId: "", invoiceNote: "", createdAt: new Date(0), updatedAt: new Date(0), createdById: null, updatedById: null };
}

/** Firm state for place-of-supply comparisons (defaults to Rajasthan, the Jaipur office). */
export async function firmStateCode() {
  return (await getFirmProfile()).stateCode || DEFAULT_FIRM_STATE;
}

/** Problems that block issuing an invoice; empty when the profile is complete. */
export function firmProfileGaps(f: { name: string; address: string; gstin: string; stateCode: string }) {
  const gaps: string[] = [];
  if (!f.name.trim()) gaps.push("firm name");
  if (!f.address.trim()) gaps.push("address");
  if (!f.stateCode) gaps.push("state");
  if (!f.gstin || !isValidGstin(f.gstin)) gaps.push("GSTIN");
  return gaps;
}

export async function updateFirmProfile(actor: Actor, input: FirmProfileInput) {
  staffOnly(actor);
  authorize(actor, "settings.manage");
  const d = parse(firmInput, input);
  const state = await db().state.findUnique({ where: { code: d.stateCode } });
  if (!state) throw new DomainError("VALIDATION", "Unknown state.", { stateCode: "Pick a state from the list" });
  if (d.pan && !PAN_RE.test(d.pan)) throw new DomainError("VALIDATION", "Check the PAN.", { pan: "PAN looks like AAAAA9999A" });
  if (d.gstin) {
    if (!isValidGstin(d.gstin)) throw new DomainError("VALIDATION", "Check the GSTIN.", { gstin: "Not a valid GSTIN (format or check character)" });
    if (d.gstin.slice(0, 2) !== state.gstCode) throw new DomainError("VALIDATION", "GSTIN state does not match.", { gstin: `A ${state.name} GSTIN starts with ${state.gstCode}` });
    if (d.pan && d.gstin.slice(2, 12) !== d.pan) throw new DomainError("VALIDATION", "GSTIN and PAN do not match.", { gstin: "Characters 3–12 of the GSTIN must be the PAN" });
  }
  return transaction(async (tx) => {
    const before = await tx.firmProfile.findFirst({ orderBy: { createdAt: "asc" } });
    const after = before
      ? await tx.firmProfile.update({ where: { id: before.id }, data: { ...d, updatedById: idOf(actor) } })
      : await tx.firmProfile.create({ data: { ...d, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "FirmProfile", entityId: after.id, action: before ? "UPDATE" : "CREATE", before, after });
    return after;
  });
}
