import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, conflict, notFound, ruleViolation } from "../../lib/errors";
import { authorize, isReadOnlyScope } from "../../permissions/guards";
import { assertClientAccess, clientWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { nextCode, toSearch } from "../../lib/codes";
import {
  CLIENT_FLAGS, CLIENT_STATUSES, CONSTITUTIONS, GST_FREQUENCIES, PAN_RE, TAN_RE, DIN_RE, UDYAM_RE, CIN_RE, LLPIN_RE,
  isCompany, zIsoDate, type ClientFlag,
} from "../../domain/enums";
import { isValidGstin } from "../../domain/gstin";
import { todayIst } from "../../lib/dates";
import { encryptOpt } from "../../lib/crypto";
import { emitApplicabilityChanged } from "./events";

import { clientInput, type ClientInput, blankToNull, optUpper } from "../../domain/schemas/client";
export type { ClientInput };

function validateIdentifiers(data: { constitution: string; cinLlpin?: string | null }) {
  if (!data.cinLlpin) return;
  if (data.constitution === "LLP" ? !LLPIN_RE.test(data.cinLlpin) : !CIN_RE.test(data.cinLlpin)) {
    throw new DomainError("VALIDATION", "CIN/LLPIN format is wrong.", { cinLlpin: data.constitution === "LLP" ? "LLPIN format is AAA-9999" : "21-character CIN" });
  }
}

/** Companies always have a statutory audit (Rules Spec 1.2: mandatory and locked). */
function lockedFlags(constitution: string): Partial<Record<ClientFlag, boolean>> {
  return isCompany(constitution) ? { statutoryAuditApplicable: true } : {};
}

export async function listClients(
  actor: Actor,
  opts: { q?: string; status?: string; groupId?: string; teamId?: string; take?: number } = {},
) {
  const scope = authorize(actor, "client.view");
  return db().client.findMany({
    where: {
      AND: [
        clientWhere(actor, scope),
        opts.q ? { OR: [{ searchName: { contains: opts.q.toLowerCase() } }, { code: { contains: opts.q.toUpperCase() } }] } : {},
        opts.status ? { status: opts.status } : { status: { not: "DISCONTINUED_CLOSED" } },
        opts.groupId ? { groupId: opts.groupId } : {},
        opts.teamId ? { teamId: opts.teamId } : {},
        { isFirm: false },
      ],
    },
    select: {
      id: true, code: true, name: true, constitution: true, status: true, pan: true, category: true,
      group: { select: { id: true, name: true } },
      partner: { select: { displayName: true } },
      manager: { select: { displayName: true } },
      team: { select: { name: true } },
      _count: { select: { gstins: true, engagements: true } },
    },
    orderBy: { name: "asc" },
    take: opts.take ?? 500,
  });
}

/** Lightweight search for pickers (work entry, engagement creation). */
export async function searchClientOptions(actor: Actor, q: string) {
  const scope = authorize(actor, "client.view");
  return db().client.findMany({
    where: {
      AND: [
        clientWhere(actor, scope),
        { status: { in: ["ACTIVE", "DORMANT", "DISCONTINUED"] } },
        q ? { OR: [{ searchName: { contains: q.toLowerCase() } }, { code: { contains: q.toUpperCase() } }] } : {},
      ],
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function getClient(actor: Actor, clientId: string) {
  const scope = await assertClientAccess(actor, "client.view", clientId);
  const client = await db().client.findUniqueOrThrow({
    where: { id: clientId },
    include: {
      group: true,
      partner: { select: { id: true, displayName: true } },
      manager: { select: { id: true, displayName: true } },
      team: { select: { id: true, name: true } },
      gstins: { orderBy: { gstin: "asc" } },
      directors: { include: { director: { select: { id: true, din: true, name: true, primaryClientId: true, email: true, mobile: true } } } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      ptRegistrations: true,
      flagHistory: { orderBy: { changedAt: "desc" }, take: 50 },
    },
  });
  const canManage = authorizeSoft(actor, "client.manage");
  return { client, canManage: canManage && !isReadOnlyScope(scope) };
}

function authorizeSoft(actor: Actor, cap: "client.manage" | "client.flags.edit") {
  try {
    authorize(actor, cap);
    return true;
  } catch {
    return false;
  }
}

/** Managers may only manage clients in their own scope; check again with the manage capability. */
async function assertManage(actor: Actor, clientId: string, cap: "client.manage" | "client.flags.edit" = "client.manage") {
  await assertClientAccess(actor, cap, clientId);
}

export async function createClient(actor: Actor, input: ClientInput & { flags?: Partial<Record<ClientFlag, boolean>> }) {
  const scope = authorize(actor, "client.manage");
  const data = parse(clientInput, input);
  validateIdentifiers(data);
  // A Manager creating a client becomes its Manager, so it stays inside their scope.
  if (scope === "team" && actor.kind === "USER") data.managerId = data.managerId ?? actor.userId;
  const flags = { ...(input.flags ?? {}), ...lockedFlags(data.constitution) };
  if (isCompany(data.constitution) && flags.dpt3Applicable === undefined) flags.dpt3Applicable = true; // Q-03 default
  if (!isCompany(data.constitution)) flags.dpt3Applicable = false; // DPT-3 is a Companies Act form (Q-03)
  const today = todayIst();
  const client = await transaction(async (tx) => {
    if (data.pan) {
      const dup = await tx.client.findFirst({ where: { pan: data.pan, status: { not: "DISCONTINUED_CLOSED" } } });
      if (dup) throw conflict(`PAN already used by ${dup.code} ${dup.name}.`);
    }
    const c = await tx.client.create({
      data: {
        ...data,
        ...flags,
        code: await nextCode(tx, "client"),
        searchName: toSearch(data.name, data.pan),
        statusEffectiveFrom: today,
        createdById: idOf(actor),
        updatedById: idOf(actor),
      },
    });
    for (const [flag, value] of Object.entries(flags)) {
      if (value) {
        await tx.clientFlagHistory.create({
          data: { clientId: c.id, flag, oldValue: null, newValue: "true", effectiveDate: data.onboardingDate ?? today, reason: "Client created", createdById: idOf(actor) },
        });
      }
    }
    await writeAudit(tx, actor, { entityType: "Client", entityId: c.id, action: "CREATE", after: c });
    return c;
  });
  await emitApplicabilityChanged(client.id, "CLIENT_CREATED");
  return client;
}

export async function updateClient(actor: Actor, clientId: string, input: Partial<ClientInput>) {
  await assertManage(actor, clientId);
  const data = parsePartial(clientInput, input);
  const before = await db().client.findUniqueOrThrow({ where: { id: clientId } });
  validateIdentifiers({ constitution: data.constitution ?? before.constitution, cinLlpin: data.cinLlpin ?? before.cinLlpin });
  const constitutionChanged = data.constitution && data.constitution !== before.constitution;
  const after = await transaction(async (tx) => {
    const extra: Record<string, unknown> = {};
    if (constitutionChanged) {
      Object.assign(extra, lockedFlags(data.constitution!));
      if (!isCompany(data.constitution!)) extra.dpt3Applicable = false;
      await tx.clientFlagHistory.create({
        data: { clientId, flag: "constitution", oldValue: before.constitution, newValue: data.constitution!, effectiveDate: todayIst(), reason: "Constitution changed", createdById: idOf(actor) },
      });
    }
    const row = await tx.client.update({
      where: { id: clientId },
      data: { ...data, ...extra, searchName: toSearch(data.name ?? before.name, data.pan ?? before.pan), updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "Client", entityId: clientId, action: "UPDATE", before, after: row });
    return row;
  });
  if (constitutionChanged) await emitApplicabilityChanged(clientId, "CONSTITUTION_CHANGED");
  return after;
}

const flagsInput = z.object({
  flags: z.partialRecord(z.enum(CLIENT_FLAGS), z.boolean()),
  effectiveDate: zIsoDate,
  reason: z.string().trim().min(3, "Give a reason"),
});

/**
 * Change applicability flags with an effective date (Rules Spec 7). Each change is written to
 * the flag history and audit trail; task generation reacts in Phase 2 via the event hook.
 */
export async function setClientFlags(actor: Actor, clientId: string, input: z.input<typeof flagsInput>) {
  await assertManage(actor, clientId, "client.flags.edit");
  const data = parse(flagsInput, input);
  const before = await db().client.findUniqueOrThrow({ where: { id: clientId } });
  const locked = lockedFlags(before.constitution);
  for (const [flag, value] of Object.entries(data.flags) as [ClientFlag, boolean][]) {
    if (locked[flag] !== undefined && locked[flag] !== value) {
      throw ruleViolation("Statutory audit is mandatory for companies and cannot be switched off.");
    }
    if (flag === "dpt3Applicable" && value && !isCompany(before.constitution)) {
      throw ruleViolation("DPT-3 applies only to companies.");
    }
  }
  const changed = (Object.entries(data.flags) as [ClientFlag, boolean][]).filter(([f, v]) => before[f] !== v);
  if (changed.length === 0) return before;
  // A flag's history must stay in date order, or "when did this apply" becomes ambiguous (Rules Spec 7).
  for (const [flag] of changed) {
    const last = await db().clientFlagHistory.findFirst({ where: { clientId, flag }, orderBy: { effectiveDate: "desc" } });
    if (last && data.effectiveDate < last.effectiveDate) {
      throw new DomainError("VALIDATION", `The effective date is before the last change to this flag (${last.effectiveDate}).`, { effectiveDate: `On or after ${last.effectiveDate}` });
    }
  }
  const after = await transaction(async (tx) => {
    for (const [flag, value] of changed) {
      await tx.clientFlagHistory.create({
        data: { clientId, flag, oldValue: String(before[flag]), newValue: String(value), effectiveDate: data.effectiveDate, reason: data.reason, createdById: idOf(actor) },
      });
    }
    const row = await tx.client.update({ where: { id: clientId }, data: { ...Object.fromEntries(changed), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Client", entityId: clientId, action: "FLAGS", before, after: row, reason: `${data.reason} (effective ${data.effectiveDate})` });
    return row;
  });
  await emitApplicabilityChanged(clientId, "FLAGS_CHANGED");
  return after;
}

const statusInput = z.object({ status: z.enum(CLIENT_STATUSES), effectiveDate: zIsoDate, reason: z.string().trim().min(3) });

export async function setClientStatus(actor: Actor, clientId: string, input: z.input<typeof statusInput>) {
  await assertManage(actor, clientId);
  const data = parse(statusInput, input);
  const before = await db().client.findUniqueOrThrow({ where: { id: clientId } });
  if (before.status === data.status) return before;
  if (data.status === "DISCONTINUED_CLOSED") throw ruleViolation("A client becomes Discontinued-Closed automatically once closure tasks are filed.");
  const after = await transaction(async (tx) => {
    await tx.clientFlagHistory.create({
      data: { clientId, flag: "status", oldValue: before.status, newValue: data.status, effectiveDate: data.effectiveDate, reason: data.reason, createdById: idOf(actor) },
    });
    const row = await tx.client.update({ where: { id: clientId }, data: { status: data.status, statusEffectiveFrom: data.effectiveDate, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Client", entityId: clientId, action: "STATUS", before, after: row, reason: data.reason });
    return row;
  });
  await emitApplicabilityChanged(clientId, "STATUS_CHANGED");
  return after;
}

// ---------------------------------------------------------------------------
// GSTINs (P1-18): each has its own state and filing frequency
// ---------------------------------------------------------------------------

const gstinInput = z.object({
  gstin: z.string().trim().toUpperCase(),
  tradeName: z.preprocess(blankToNull, z.string().nullable().optional()),
  frequency: z.enum(GST_FREQUENCIES),
  frequencyEffectiveFrom: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  iffOpted: z.boolean().default(false),
  annualReturnApplicable: z.boolean().default(false),
  gstr9cApplicable: z.boolean().default(false),
  registrationDate: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
});

export async function addGstin(actor: Actor, clientId: string, input: z.input<typeof gstinInput>) {
  await assertManage(actor, clientId, "client.flags.edit");
  const data = parse(gstinInput, input);
  if (!isValidGstin(data.gstin)) throw new DomainError("VALIDATION", "GSTIN is not valid (format or check digit).", { gstin: "Invalid GSTIN" });
  validateGstinFlags(data);
  const client = await db().client.findUniqueOrThrow({ where: { id: clientId } });
  if (client.pan && data.gstin.slice(2, 12) !== client.pan) {
    throw new DomainError("VALIDATION", "GSTIN does not contain the client's PAN.", { gstin: "PAN mismatch" });
  }
  const state = await db().state.findUnique({ where: { gstCode: data.gstin.slice(0, 2) } });
  if (!state) throw new DomainError("VALIDATION", "Unknown state code in GSTIN.", { gstin: "Unknown state code" });
  const row = await transaction(async (tx) => {
    if (await tx.gSTIN.findUnique({ where: { gstin: data.gstin } })) throw conflict("This GSTIN is already registered.");
    const g = await tx.gSTIN.create({
      data: { ...data, clientId, stateCode: state.code, frequencyEffectiveFrom: data.frequencyEffectiveFrom ?? todayIst(), createdById: idOf(actor) },
    });
    await tx.clientFlagHistory.create({
      data: { clientId, flag: "gstin.added", partyKey: g.id, newValue: `${g.gstin}:${g.frequency}`, effectiveDate: g.frequencyEffectiveFrom!, reason: "GSTIN added", createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "GSTIN", entityId: g.id, action: "CREATE", after: g });
    return g;
  });
  await emitApplicabilityChanged(clientId, "GSTIN_CHANGED");
  return row;
}

function validateGstinFlags(d: { frequency?: string; iffOpted?: boolean; annualReturnApplicable?: boolean; gstr9cApplicable?: boolean }) {
  if (d.iffOpted && d.frequency && d.frequency !== "QRMP") throw ruleViolation("IFF applies only to QRMP filers.");
  if (d.gstr9cApplicable && d.annualReturnApplicable === false) throw ruleViolation("GSTR-9C needs GSTR-9 to apply.");
}

const gstinUpdate = z.object({
  tradeName: z.preprocess(blankToNull, z.string().nullable().optional()),
  frequency: z.enum(GST_FREQUENCIES).optional(),
  frequencyEffectiveFrom: zIsoDate.optional(),
  iffOpted: z.boolean().optional(),
  annualReturnApplicable: z.boolean().optional(),
  gstr9cApplicable: z.boolean().optional(),
  status: z.enum(["ACTIVE", "CANCELLED", "SUSPENDED"]).optional(),
  cancellationDate: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  reason: z.string().trim().min(3, "Give a reason"),
});

/** Frequency change needs an effective date set by Admin/Manager per what GSTN allowed (Rules Spec 7.3). */
export async function updateGstin(actor: Actor, gstinId: string, input: z.input<typeof gstinUpdate>) {
  const before = await db().gSTIN.findUnique({ where: { id: gstinId } });
  if (!before) throw notFound("GSTIN");
  await assertManage(actor, before.clientId, "client.flags.edit");
  const { reason, ...data } = parse(gstinUpdate, input);
  validateGstinFlags({ ...before, ...data });
  if (data.frequency && data.frequency !== before.frequency && !data.frequencyEffectiveFrom) {
    throw new DomainError("VALIDATION", "Give the date the new frequency takes effect.", { frequencyEffectiveFrom: "Required" });
  }
  if (data.status === "CANCELLED" && !data.cancellationDate) {
    throw new DomainError("VALIDATION", "Give the cancellation date.", { cancellationDate: "Required" });
  }
  const after = await transaction(async (tx) => {
    const row = await tx.gSTIN.update({ where: { id: gstinId }, data: { ...data, updatedById: idOf(actor) } });
    for (const key of ["frequency", "iffOpted", "annualReturnApplicable", "gstr9cApplicable", "status"] as const) {
      if (data[key] !== undefined && String(data[key]) !== String(before[key])) {
        await tx.clientFlagHistory.create({
          data: {
            clientId: before.clientId,
            flag: `gstin.${key}`,
            partyKey: gstinId,
            oldValue: String(before[key]),
            newValue: String(data[key]),
            effectiveDate: (key === "frequency" ? data.frequencyEffectiveFrom : key === "status" ? data.cancellationDate : null) ?? todayIst(),
            reason,
            createdById: idOf(actor),
          },
        });
      }
    }
    await writeAudit(tx, actor, { entityType: "GSTIN", entityId: gstinId, action: "UPDATE", before, after: row, reason });
    return row;
  });
  await emitApplicabilityChanged(before.clientId, "GSTIN_CHANGED");
  return after;
}

// ---------------------------------------------------------------------------
// Directors (P1-19): one DIR-3 KYC obligation per director (Q-04)
// ---------------------------------------------------------------------------

const directorInput = z.object({
  din: z.string().trim().regex(DIN_RE, "DIN is 8 digits"),
  name: z.string().trim().min(2),
  pan: optUpper(PAN_RE, "PAN format is AAAAA9999A"),
  email: z.preprocess(blankToNull, z.string().email().nullable().optional()),
  mobile: z.preprocess(blankToNull, z.string().nullable().optional()),
  designation: z.string().default("DIRECTOR"),
  appointedOn: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
});

/** Add a director to a client. An existing DIN is linked, not duplicated. */
export async function addDirector(actor: Actor, clientId: string, input: z.input<typeof directorInput>) {
  await assertManage(actor, clientId);
  const data = parse(directorInput, input);
  const client = await db().client.findUniqueOrThrow({ where: { id: clientId } });
  if (!["PRIVATE_COMPANY", "PUBLIC_COMPANY", "LLP"].includes(client.constitution)) {
    throw ruleViolation("Directors / designated partners apply to companies and LLPs only.");
  }
  const result = await transaction(async (tx) => {
    let director = await tx.director.findUnique({ where: { din: data.din } });
    if (!director) {
      director = await tx.director.create({
        data: {
          din: data.din, name: data.name, searchName: toSearch(data.name, data.din), panEnc: encryptOpt(data.pan, "PII"),
          email: data.email ?? null, mobile: data.mobile ?? null, primaryClientId: clientId, createdById: idOf(actor),
        },
      });
      await writeAudit(tx, actor, { entityType: "Director", entityId: director.id, action: "CREATE", after: { din: data.din, name: data.name } });
    } else if (!director.primaryClientId) {
      director = await tx.director.update({ where: { id: director.id }, data: { primaryClientId: clientId } });
    }
    const existing = await tx.clientDirector.findUnique({ where: { clientId_directorId: { clientId, directorId: director.id } } });
    if (existing && !existing.ceasedOn) throw conflict("This director is already linked to the client.");
    const link = existing
      ? await tx.clientDirector.update({ where: { id: existing.id }, data: { ceasedOn: null, appointedOn: data.appointedOn ?? null, designation: data.designation } })
      : await tx.clientDirector.create({
          data: { clientId, directorId: director.id, designation: data.designation, appointedOn: data.appointedOn ?? null, createdById: idOf(actor) },
        });
    await writeAudit(tx, actor, { entityType: "ClientDirector", entityId: link.id, action: "LINK", after: { clientId, din: data.din } });
    return { director, link };
  });
  await emitApplicabilityChanged(clientId, "DIRECTORS_CHANGED");
  return result;
}

export async function ceaseDirector(actor: Actor, clientId: string, directorId: string, ceasedOn: string) {
  await assertManage(actor, clientId);
  parse(zIsoDate, ceasedOn);
  await transaction(async (tx) => {
    const link = await tx.clientDirector.findUnique({ where: { clientId_directorId: { clientId, directorId } } });
    if (!link) throw notFound("Director link");
    await tx.clientDirector.update({ where: { id: link.id }, data: { ceasedOn, updatedById: idOf(actor) } });
    // Move the director's DIR-3 KYC home to another company they still serve, if any.
    const director = await tx.director.findUniqueOrThrow({ where: { id: directorId } });
    if (director.primaryClientId === clientId) {
      const other = await tx.clientDirector.findFirst({ where: { directorId, ceasedOn: null, clientId: { not: clientId } } });
      await tx.director.update({ where: { id: directorId }, data: { primaryClientId: other?.clientId ?? clientId } });
    }
    await writeAudit(tx, actor, { entityType: "ClientDirector", entityId: link.id, action: "CEASE", after: { ceasedOn } });
  });
  await emitApplicabilityChanged(clientId, "DIRECTORS_CHANGED");
}

// ---------------------------------------------------------------------------
// Contacts and Professional Tax registrations
// ---------------------------------------------------------------------------

const contactInput = z.object({
  name: z.string().trim().min(2),
  role: z.string().default(""),
  email: z.preprocess(blankToNull, z.string().email().nullable().optional()),
  phone: z.preprocess(blankToNull, z.string().nullable().optional()),
  whatsapp: z.preprocess(blankToNull, z.string().nullable().optional()),
  preferredChannel: z.enum(["EMAIL", "WHATSAPP", "PHONE"]).default("EMAIL"),
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
  birthday: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  notes: z.string().default(""),
});

export async function saveContact(actor: Actor, clientId: string, input: z.input<typeof contactInput>, contactId?: string) {
  await assertManage(actor, clientId);
  const data = parse(contactInput, input);
  return transaction(async (tx) => {
    if (data.isPrimary) await tx.contact.updateMany({ where: { clientId, isPrimary: true }, data: { isPrimary: false } });
    const before = contactId ? await tx.contact.findFirst({ where: { id: contactId, clientId } }) : null;
    if (contactId && !before) throw notFound("Contact");
    const row = contactId
      ? await tx.contact.update({ where: { id: contactId }, data: { ...data, updatedById: idOf(actor) } })
      : await tx.contact.create({ data: { ...data, clientId, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Contact", entityId: row.id, action: before ? "UPDATE" : "CREATE", before, after: row });
    return row;
  });
}

const ptInput = z.object({
  stateCode: z.string(),
  kind: z.enum(["EMPLOYER", "ENROLMENT"]).default("EMPLOYER"),
  registrationNo: z.preprocess(blankToNull, z.string().nullable().optional()),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"]).default("MONTHLY"),
  effectiveFrom: zIsoDate,
});

/** Professional Tax registration; only for states that levy PT (open-questions Q-02). */
export async function addPtRegistration(actor: Actor, clientId: string, input: z.input<typeof ptInput>) {
  await assertManage(actor, clientId, "client.flags.edit");
  const data = parse(ptInput, input);
  const state = await db().state.findUnique({ where: { code: data.stateCode } });
  if (!state) throw new DomainError("VALIDATION", "Unknown state.", { stateCode: "Unknown" });
  if (!state.ptLevied) throw ruleViolation(`${state.name} does not levy Professional Tax.`);
  const row = await transaction(async (tx) => {
    const r = await tx.clientPtRegistration.create({ data: { ...data, clientId, createdById: idOf(actor) } });
    await tx.clientFlagHistory.create({
      data: { clientId, flag: "pt.registration", partyKey: data.stateCode, newValue: data.kind, effectiveDate: data.effectiveFrom, reason: "PT registration added", createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "ClientPtRegistration", entityId: r.id, action: "CREATE", after: r });
    return r;
  });
  await emitApplicabilityChanged(clientId, "PT_CHANGED");
  return row;
}

export async function endPtRegistration(actor: Actor, registrationId: string, effectiveTo: string, reason: string) {
  const reg = await db().clientPtRegistration.findUnique({ where: { id: registrationId } });
  if (!reg) throw notFound("PT registration");
  await assertManage(actor, reg.clientId, "client.flags.edit");
  parse(zIsoDate, effectiveTo);
  await transaction(async (tx) => {
    await tx.clientPtRegistration.update({ where: { id: registrationId }, data: { effectiveTo, updatedById: idOf(actor) } });
    await tx.clientFlagHistory.create({
      data: { clientId: reg.clientId, flag: "pt.registration", partyKey: reg.stateCode, oldValue: reg.kind, newValue: null, effectiveDate: effectiveTo, reason, createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "ClientPtRegistration", entityId: registrationId, action: "END", reason });
  });
  await emitApplicabilityChanged(reg.clientId, "PT_CHANGED");
}

// ---------------------------------------------------------------------------
// Groups (P2-18 group view lands in Phase 2; master data now)
// ---------------------------------------------------------------------------

export async function listGroups(actor: Actor) {
  const scope = authorize(actor, "client.view");
  return db().clientGroup.findMany({
    where: { clients: { some: clientWhere(actor, scope) } },
    include: { _count: { select: { clients: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createGroup(actor: Actor, name: string, notes = "") {
  authorize(actor, "client.manage");
  const clean = parse(z.string().trim().min(2).max(120), name);
  return transaction(async (tx: Tx) => {
    const g = await tx.clientGroup.create({ data: { name: clean, notes, code: await nextCode(tx, "group"), searchName: clean.toLowerCase(), createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ClientGroup", entityId: g.id, action: "CREATE", after: g });
    return g;
  });
}

export async function listAllGroupsForPicker(actor: Actor) {
  authorize(actor, "client.view");
  return db().clientGroup.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
}

export async function listStates() {
  return db().state.findMany({ orderBy: { name: "asc" } });
}

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
