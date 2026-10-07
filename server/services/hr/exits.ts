import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { encryptJson, decryptJson } from "../../lib/crypto";
import { addDays, diffDays, parseIso } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { canWrite, idOf, namesOf, requireWrite, seesSalaryFirm, staffId, zIso } from "./common";
import { assetsHeldBy } from "./assets";
import { closeArticleship } from "./articleship";
import { persistLetter, prepareLetter } from "./letters";

// ---------------------------------------------------------------------------
// Exit and full-and-final (spec 11.12, P3-24)
// ---------------------------------------------------------------------------

export const EXIT_STATUSES = ["NOTICE", "HANDOVER", "FNF", "CLOSED"] as const;
export type ExitStatus = (typeof EXIT_STATUSES)[number];
export const EXIT_LABELS: Record<ExitStatus, string> = { NOTICE: "Notice period", HANDOVER: "Handover", FNF: "Full & final", CLOSED: "Closed" };

/** Notice period by role is firm policy (not statutory): a setting with these fallbacks. */
const NOTICE_FALLBACK: Record<string, number> = { PARTNER: 90, MANAGER: 60, STAFF: 30, ARTICLE: 30, PRACTICE_ADMIN: 30, HR_ADMIN: 30 };

export async function noticeDaysFor(role: string) {
  const map = await getSetting<Record<string, number>>("exit.noticeDaysByRole", NOTICE_FALLBACK);
  return map[role] ?? NOTICE_FALLBACK[role] ?? 30;
}

type ChecklistSeed = { code: string; label: string };

/**
 * Handover checklist from the person's custody (spec 11.12): open tasks, engagements, DSCs, documents
 * from the inward register, firm assets, vault grants and client-team memberships, plus the standard
 * steps. HR has no client data, so client-linked items are labelled without client names.
 */
async function custodyChecklist(userId: string, role: string): Promise<{ items: ChecklistSeed[]; held: Set<string> }> {
  const [openTasks, engagements, dscs, docs, assets, grants, teams] = await Promise.all([
    db().task.count({ where: { assignments: { some: { userId, toDate: null } }, status: { notIn: ["FILED", "FILED_LATE", "NOT_APPLICABLE"] } } }),
    db().engagement.count({ where: { assignments: { some: { userId, toDate: null } }, status: "ACTIVE" } }),
    db().dSC.findMany({ where: { custodianUserId: userId, custody: "STAFF", active: true }, select: { id: true, holderName: true } }),
    db().inwardOutward.findMany({ where: { custodianUserId: userId, returnedAt: null }, select: { id: true } }),
    assetsHeldBy(userId),
    db().credentialGrant.count({ where: { userId, revokedAt: null } }),
    db().clientTeamMember.findMany({ where: { userId, toDate: null }, include: { team: { select: { name: true } } } }),
  ]);
  const items: ChecklistSeed[] = [];
  const held = new Set<string>();
  const add = (code: string, label: string, isHeld: boolean) => {
    items.push({ code, label });
    if (isHeld) held.add(code);
  };
  add("TASKS", openTasks ? `Reassign ${openTasks} open task${openTasks === 1 ? "" : "s"}` : "Open tasks reassigned (none open)", openTasks > 0);
  add("ENGAGEMENTS", engagements ? `Hand over ${engagements} engagement${engagements === 1 ? "" : "s"}` : "Engagements handed over (none active)", engagements > 0);
  for (const d of dscs) add(`DSC:${d.id}`, `Return DSC token: ${d.holderName}`, true);
  for (const d of docs) add(`DOC:${d.id}`, "Return client document held (inward register)", true);
  for (const a of assets) add(`ASSET:${a.assetId}`, `Return ${a.kind.toLowerCase()} ${a.tag}`, true);
  add("VAULT", grants ? `Remove vault access (${grants} grant${grants === 1 ? "" : "s"})` : "Vault access removed (no grants)", grants > 0);
  for (const t of teams) add(`TEAM:${t.id}`, `Remove from client team: ${t.team.name}`, true);
  add("HANDOVER_NOTE", "Handover note given to the Manager", false);
  if (role === "ARTICLE") add("INSTITUTE", "Completion / termination paperwork recorded with the institute", false);
  add("FNF", "Full and final settlement computed", false);
  add("LETTERS", "Relieving and experience letters issued", false);
  return { items, held };
}

/** Custody items are ticked automatically once they are no longer held; manual steps stay as they are. */
async function syncChecklist(tx: Tx, actor: Actor, exitCaseId: string, custody: Awaited<ReturnType<typeof custodyChecklist>>) {
  // Custody is read before the transaction: reads through db() inside a write transaction would wait on it.
  const { items, held } = custody;
  const existing = await tx.exitChecklistItem.findMany({ where: { exitCaseId } });
  const byCode = new Map(existing.map((e) => [e.code, e]));
  const AUTO = /^(TASKS|ENGAGEMENTS|VAULT|DSC:|DOC:|ASSET:|TEAM:)/;
  for (const it of items) {
    const cur = byCode.get(it.code);
    const autoDone = AUTO.test(it.code) && !held.has(it.code);
    if (!cur) await tx.exitChecklistItem.create({ data: { exitCaseId, code: it.code, label: it.label, done: autoDone, doneAt: autoDone ? new Date() : null, createdById: idOf(actor) } });
    else if (AUTO.test(it.code) && (cur.label !== it.label || cur.done !== autoDone)) {
      await tx.exitChecklistItem.update({ where: { id: cur.id }, data: { label: it.label, done: autoDone, doneAt: autoDone ? (cur.doneAt ?? new Date()) : null, updatedById: idOf(actor) } });
    }
  }
  // Items that disappeared from custody (returned) are done.
  for (const cur of existing) {
    if (AUTO.test(cur.code) && !items.some((i) => i.code === cur.code) && !cur.done) {
      await tx.exitChecklistItem.update({ where: { id: cur.id }, data: { done: true, doneAt: new Date(), updatedById: idOf(actor) } });
    }
  }
}

const exitInput = z.object({
  userId: z.string().min(1, "Choose the person"),
  resignationDate: zIso,
  noticeDays: z.coerce.number().int().min(0).max(365).nullish(),
  lastWorkingDate: zIso.nullish(),
});

export async function startExit(actor: Actor, input: z.input<typeof exitInput>) {
  requireWrite(actor, "exit.manage");
  const p = parse(exitInput, input);
  const u = await db().user.findUnique({ where: { id: p.userId } });
  if (!u || u.isSystem) throw notFound("Person");
  if (actor.kind === "USER" && actor.userId === u.id) throw ruleViolation("You cannot run your own exit.");
  if (await db().exitCase.findUnique({ where: { userId: u.id } })) throw ruleViolation("An exit case already exists for this person.");
  const noticeDays = p.noticeDays ?? (await noticeDaysFor(u.role));
  const lwd = p.lastWorkingDate ?? addDays(p.resignationDate, noticeDays);
  if (lwd < p.resignationDate) throw new DomainError("VALIDATION", "Last working day is before the resignation.", { lastWorkingDate: "Before the resignation date" });
  const custody = await custodyChecklist(u.id, u.role);
  const ex = await transaction(async (tx) => {
    const e = await tx.exitCase.create({ data: { userId: u.id, resignationDate: p.resignationDate, noticeDays, lastWorkingDate: lwd, createdById: idOf(actor) } });
    await syncChecklist(tx, actor, e.id, custody);
    await writeAudit(tx, actor, { entityType: "ExitCase", entityId: e.id, action: "CREATE", after: e });
    return e;
  });
  if (u.reportingManagerId) await notifyUsers([u.reportingManagerId], { kind: "EXIT", title: `${u.displayName} has resigned`, body: `Last working day ${lwd}. Plan the handover.`, link: `/hr/exits/${ex.id}`, dedupeKey: `exit-${ex.id}` });
  return ex;
}

async function visibleExit(actor: Actor, exitId: string) {
  const scope = authorize(actor, "exit.manage");
  const e = await db().exitCase.findUnique({ where: { id: exitId }, include: { items: { orderBy: { createdAt: "asc" } } } });
  if (!e) throw notFound("Exit case");
  const ok = await db().user.count({ where: { AND: [{ id: e.userId }, userWhere(actor, scope)] } });
  if (!ok) throw forbidden();
  return e;
}

export async function listExits(actor: Actor) {
  const scope = authorize(actor, "exit.manage");
  const people = await db().user.findMany({ where: userWhere(actor, scope), select: { id: true } });
  const rows = await db().exitCase.findMany({ where: { userId: { in: people.map((p) => p.id) } }, include: { items: { select: { done: true } } }, orderBy: [{ status: "asc" }, { lastWorkingDate: "asc" }] });
  const names = await namesOf(rows.map((r) => r.userId));
  return rows.map((r) => ({ ...r, ffComputedEnc: null, name: names.get(r.userId) ?? "", openItems: r.items.filter((i) => !i.done).length, totalItems: r.items.length }));
}

export type FnfInput = z.input<typeof fnfInput>;
const paise = z.coerce.number().int().min(0).default(0);
const fnfInput = z.object({
  monthlyGrossPaise: z.coerce.number().int().min(0),
  unpaidDays: z.coerce.number().min(0).max(31).default(0),
  leaveEncashDays: z.coerce.number().min(0).max(365).default(0),
  waiveNoticeRecovery: z.boolean().default(false),
  assetRecoveryPaise: paise,
  advancesPaise: paise,
  otherEarningsPaise: paise,
  otherDeductionsPaise: paise,
  notes: z.string().max(2000).default(""),
});

export type FnfResult = {
  input: z.infer<typeof fnfInput>;
  daysInMonth: number;
  perDayPaise: number;
  salaryPaise: number;
  encashmentAllowed: boolean;
  encashmentPaise: number;
  noticeShortfallDays: number;
  noticeRecoveryPaise: number;
  netPaise: number;
  computedAt: string;
  computedById: string | null;
};

function daysInMonthOf(iso: string) {
  const { y, m } = parseIso(iso);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Pure F&F arithmetic. Per-day pay = monthly gross ÷ days in the month of the last working day. Notice
 * shortfall (days served < notice days) is recovered at the per-day rate unless waived or the
 * exit.recoverNoticeShortfall setting is off. Leave encashment only when a leave policy allows it.
 */
export function computeFnf(p: z.infer<typeof fnfInput>, ctx: { resignationDate: string; lastWorkingDate: string; noticeDays: number; encashmentAllowed: boolean; recoverShortfall: boolean }) {
  const daysInMonth = daysInMonthOf(ctx.lastWorkingDate);
  const perDay = Math.round(p.monthlyGrossPaise / daysInMonth);
  const salary = Math.round(perDay * p.unpaidDays);
  const encashment = ctx.encashmentAllowed ? Math.round(perDay * p.leaveEncashDays) : 0;
  const served = diffDays(ctx.resignationDate, ctx.lastWorkingDate);
  const shortfall = Math.max(0, ctx.noticeDays - served);
  const recovery = ctx.recoverShortfall && !p.waiveNoticeRecovery ? perDay * shortfall : 0;
  const net = salary + encashment + p.otherEarningsPaise - recovery - p.assetRecoveryPaise - p.advancesPaise - p.otherDeductionsPaise;
  return { daysInMonth, perDayPaise: perDay, salaryPaise: salary, encashmentAllowed: ctx.encashmentAllowed, encashmentPaise: encashment, noticeShortfallDays: shortfall, noticeRecoveryPaise: recovery, netPaise: net };
}

/** Does any leave policy for the person's category allow encashment? (Policies are maintained in HR → Leave policies.) */
async function encashmentAllowedFor(userId: string) {
  const cat = (await db().employeeProfile.findUnique({ where: { userId }, select: { employeeCategory: true } }))?.employeeCategory ?? "STAFF";
  return (await db().leavePolicy.count({ where: { employeeCategory: cat, encashable: true } })) > 0;
}

/**
 * Compute and store F&F (encrypted, salary-class). Monthly gross is typed by HR: the payroll module
 * holds salary structures and this service does not read its tables.
 */
export async function computeAndSaveFnf(actor: Actor, exitId: string, input: FnfInput) {
  requireWrite(actor, "exit.manage");
  if (!seesSalaryFirm(actor)) throw forbidden();
  const e = await visibleExit(actor, exitId);
  if (e.status === "CLOSED") throw ruleViolation("This exit is closed.");
  if (!e.lastWorkingDate) throw ruleViolation("Set the last working day first.");
  const p = parse(fnfInput, input);
  const encashmentAllowed = await encashmentAllowedFor(e.userId);
  const recoverShortfall = await getSetting<boolean>("exit.recoverNoticeShortfall", true);
  const calc = computeFnf(p, { resignationDate: e.resignationDate, lastWorkingDate: e.lastWorkingDate, noticeDays: e.noticeDays, encashmentAllowed, recoverShortfall });
  const result: FnfResult = { input: p, ...calc, computedAt: new Date().toISOString(), computedById: idOf(actor) };
  await transaction(async (tx) => {
    await tx.exitCase.update({ where: { id: exitId }, data: { ffComputedEnc: encryptJson(result, "PII"), status: e.status === "NOTICE" || e.status === "HANDOVER" ? "FNF" : e.status, updatedById: idOf(actor) } });
    await tx.exitChecklistItem.updateMany({ where: { exitCaseId: exitId, code: "FNF" }, data: { done: true, doneAt: new Date(), doneById: idOf(actor) } });
    // Amounts are never written to the audit trail in clear.
    await writeAudit(tx, actor, { entityType: "ExitCase", entityId: exitId, action: "FNF_COMPUTED", after: { status: "FNF" } });
  });
  return result;
}

/** Exit detail. F&F amounts only for Partner / HR (and the person themself); others see "computed". */
export async function getExit(actor: Actor, exitId: string) {
  const e = await visibleExit(actor, exitId);
  const user = await db().user.findUnique({ where: { id: e.userId }, select: { id: true, displayName: true, role: true, reportingManagerId: true } });
  let fnf: FnfResult | null = null;
  const self = actor.kind === "USER" && actor.userId === e.userId;
  if (e.ffComputedEnc && (seesSalaryFirm(actor) || self)) {
    fnf = decryptJson<FnfResult>(e.ffComputedEnc, "PII");
    if (!self) await logSensitiveView(actor, "SALARY", "ExitCase", e.id, "full and final");
  }
  const letters = await db().hRLetter.findMany({ where: { userId: e.userId, kind: { in: ["RELIEVING", "EXPERIENCE"] } }, orderBy: { createdAt: "desc" } });
  const hasEncashPolicy = await encashmentAllowedFor(e.userId);
  return {
    exit: { ...e, ffComputedEnc: null }, fnfComputed: !!e.ffComputedEnc, fnf, user, letters, hasEncashPolicy,
    canWrite: canWrite(actor, "exit.manage"), seesMoney: seesSalaryFirm(actor),
  };
}

export async function refreshChecklist(actor: Actor, exitId: string) {
  requireWrite(actor, "exit.manage");
  const e = await visibleExit(actor, exitId);
  const u = await db().user.findUniqueOrThrow({ where: { id: e.userId } });
  const custody = await custodyChecklist(u.id, u.role);
  await transaction(async (tx) => {
    await syncChecklist(tx, actor, exitId, custody);
    await writeAudit(tx, actor, { entityType: "ExitCase", entityId: exitId, action: "CHECKLIST_REFRESH" });
  });
}

export async function toggleExitItem(actor: Actor, itemId: string, done: boolean) {
  requireWrite(actor, "exit.manage");
  const item = await db().exitChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound("Checklist item");
  await visibleExit(actor, item.exitCaseId);
  if (/^(DSC:|DOC:|ASSET:|TEAM:|TASKS|ENGAGEMENTS|VAULT)/.test(item.code) && done) {
    // Custody items tick themselves when the item is actually returned/reassigned.
    const e = await db().exitCase.findUniqueOrThrow({ where: { id: item.exitCaseId } });
    const u = await db().user.findUniqueOrThrow({ where: { id: e.userId } });
    const { held } = await custodyChecklist(u.id, u.role);
    if (held.has(item.code)) throw ruleViolation("Still held. Record the return / reassignment in its register first (it ticks itself).");
  }
  await transaction(async (tx) => {
    await tx.exitChecklistItem.update({ where: { id: itemId }, data: { done, doneAt: done ? new Date() : null, doneById: done ? idOf(actor) : null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ExitChecklistItem", entityId: itemId, action: done ? "DONE" : "UNDONE", after: { code: item.code } });
  });
}

export async function updateExitDates(actor: Actor, exitId: string, input: { lastWorkingDate: string; noticeDays: number }) {
  requireWrite(actor, "exit.manage");
  const e = await visibleExit(actor, exitId);
  if (e.status === "CLOSED") throw ruleViolation("This exit is closed.");
  const p = parse(z.object({ lastWorkingDate: zIso, noticeDays: z.coerce.number().int().min(0).max(365) }), input);
  if (p.lastWorkingDate < e.resignationDate) throw new DomainError("VALIDATION", "Last working day is before the resignation.", { lastWorkingDate: "Before the resignation date" });
  await transaction(async (tx) => {
    const after = await tx.exitCase.update({ where: { id: exitId }, data: { ...p, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ExitCase", entityId: exitId, action: "UPDATE", before: { lastWorkingDate: e.lastWorkingDate, noticeDays: e.noticeDays }, after: { lastWorkingDate: after.lastWorkingDate, noticeDays: after.noticeDays } });
  });
}

/** Move to the next phase. Closing needs every checklist step done, F&F and the relieving letter. */
export async function advanceExit(actor: Actor, exitId: string) {
  requireWrite(actor, "exit.manage");
  const e = await visibleExit(actor, exitId);
  const i = EXIT_STATUSES.indexOf(e.status as ExitStatus);
  if (i >= EXIT_STATUSES.length - 1) throw ruleViolation("This exit is closed.");
  const next = EXIT_STATUSES[i + 1]!;
  if (next === "FNF" && e.items.some((it) => !it.done && !["FNF", "LETTERS", "INSTITUTE"].includes(it.code))) throw ruleViolation("Finish the handover checklist first.");
  if (next === "CLOSED") {
    const open = e.items.filter((it) => !it.done);
    if (open.length) throw ruleViolation(`${open.length} checklist step(s) are still open.`);
    if (!e.ffComputedEnc) throw ruleViolation("Compute the full and final settlement first.");
    if (!e.relievingLetterDocId) throw ruleViolation("Generate the relieving letter first.");
  }
  await transaction(async (tx) => {
    await tx.exitCase.update({ where: { id: exitId }, data: { status: next, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ExitCase", entityId: exitId, action: "ADVANCE", before: { status: e.status }, after: { status: next } });
  });
  return next;
}

/** Relieving / experience letters from templates (via the HR letters service). */
export async function generateExitLetter(actor: Actor, exitId: string, kind: "RELIEVING" | "EXPERIENCE", extra: Record<string, string> = {}, allowMissing = false) {
  requireWrite(actor, "exit.manage");
  if (actor.kind === "USER" && !["HR_ADMIN", "PARTNER"].includes(actor.role)) throw forbidden();
  const e = await visibleExit(actor, exitId);
  if (!e.lastWorkingDate) throw ruleViolation("Set the last working day first.");
  const u = await db().user.findUniqueOrThrow({ where: { id: e.userId }, include: { designation: true } });
  const prepared = await prepareLetter({ userId: e.userId, kind, extra: { lastWorkingDate: e.lastWorkingDate!, resignationDate: e.resignationDate, position: u.designation?.name ?? "", ...extra }, allowMissing });
  return transaction(async (tx) => {
    const r = await persistLetter(tx, actor, prepared);
    await tx.exitCase.update({ where: { id: exitId }, data: kind === "RELIEVING" ? { relievingLetterDocId: r.letter.documentId } : { experienceLetterDocId: r.letter.documentId } });
    const fresh = await tx.exitCase.findUniqueOrThrow({ where: { id: exitId } });
    if (fresh.relievingLetterDocId && fresh.experienceLetterDocId) {
      await tx.exitChecklistItem.updateMany({ where: { exitCaseId: exitId, code: "LETTERS" }, data: { done: true, doneAt: new Date(), doneById: idOf(actor) } });
    }
    return r;
  });
}

const instituteInput = z.object({ outcome: z.enum(["COMPLETED", "TERMINATED", "TRANSFERRED"]), date: zIso, note: z.string().trim().min(2, "Describe what was filed with the institute").max(2000) });

/** Articles: completion / termination paperwork with the institute recorded on the exit and the record. */
export async function recordInstitutePaperwork(actor: Actor, exitId: string, input: z.input<typeof instituteInput>) {
  requireWrite(actor, "exit.manage");
  const e = await visibleExit(actor, exitId);
  const p = parse(instituteInput, input);
  const u = await db().user.findUniqueOrThrow({ where: { id: e.userId } });
  if (u.role !== "ARTICLE") throw ruleViolation("Institute paperwork applies to Article Assistants.");
  await closeArticleship(actor, u.id, p.outcome, p.date, p.note);
  await transaction(async (tx) => {
    await tx.exitCase.update({ where: { id: exitId }, data: { instituteClosureNote: `${p.outcome} on ${p.date}: ${p.note}`, updatedById: idOf(actor) } });
    await tx.exitChecklistItem.updateMany({ where: { exitCaseId: exitId, code: "INSTITUTE" }, data: { done: true, doneAt: new Date(), doneById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ExitCase", entityId: exitId, action: "INSTITUTE_PAPERWORK", after: p });
  });
}

/** People who may resign (for the "Start exit" picker): active, no open exit. */
export async function exitCandidates(actor: Actor) {
  requireWrite(actor, "exit.manage");
  const me = staffId(actor);
  const taken = (await db().exitCase.findMany({ select: { userId: true } })).map((e) => e.userId);
  return db().user.findMany({ where: { active: true, isSystem: false, id: { notIn: [...taken, me] } }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: "asc" } });
}

