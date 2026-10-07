import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can, scopeOf } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, diffDays, parseIso, todayIst } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { hrPeople, idOf, isHrOrPartner, namesOf, personInScope, staffId, storeHrDocument, zIso } from "./common";

// ---------------------------------------------------------------------------
// CPE log, internal training and the skill matrix (spec 11.9, P3-21)
// ---------------------------------------------------------------------------

export type CpeStatus = {
  institute: string;
  requirement: null | { id: string; memberClass: string; totalMinutes: number; structuredMinutes: number; perYearMinutes: number; verified: boolean; source: string };
  block: null | { fromYear: number; toYear: number; from: string; to: string; daysLeft: number };
  completedMinutes: number;
  structuredMinutes: number;
  currentYearMinutes: number;
  shortfall: { totalMinutes: number; structuredMinutes: number; yearMinutes: number };
};

/** Qualified members (ICAI/ICSI membership on the employee record) are the people CPE applies to. */
export async function qualifiedMembers(userIds?: string[]) {
  const rows = await db().employeeProfile.findMany({
    where: { membershipBody: { in: ["ICAI", "ICSI"] }, membershipNo: { not: null }, user: { active: true }, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { userId: true, membershipBody: true },
  });
  return new Map(rows.map((r) => [r.userId, r.membershipBody!]));
}

/**
 * The block containing `today`: blocks repeat every `blockYears` from the requirement's start year.
 * CPE years are calendar years (ICAI practice); the member class comes from the cpe.memberClass setting.
 */
export async function cpeRequirement(institute: string, today = todayIst()) {
  const memberClass = await getSetting<string>("cpe.memberClass", "PRACTICE");
  const rows = await db().cpeRequirement.findMany({ where: { institute, effectiveFrom: { lte: today } }, orderBy: { effectiveFrom: "desc" } });
  return rows.find((r) => r.memberClass === memberClass) ?? rows[0] ?? null;
}

export function blockFor(req: { blockStartYear: number; blockYears: number }, today: string) {
  const year = parseIso(today).y;
  const years = Math.max(1, req.blockYears);
  const k = Math.floor((year - req.blockStartYear) / years);
  const fromYear = req.blockStartYear + k * years;
  const toYear = fromYear + years - 1;
  return { fromYear, toYear, from: `${fromYear}-01-01`, to: `${toYear}-12-31`, daysLeft: diffDays(today, `${toYear}-12-31`) };
}

export async function cpeStatus(userId: string, institute: string, today = todayIst()): Promise<CpeStatus> {
  const req = await cpeRequirement(institute, today);
  const block = req ? blockFor(req, today) : null;
  const year = parseIso(today).y;
  const logs = await db().cPELog.findMany({ where: { userId, ...(block ? { date: { gte: block.from, lte: block.to } } : { date: { gte: `${year}-01-01` } }) }, select: { date: true, minutes: true, structured: true } });
  const completed = logs.reduce((s, l) => s + l.minutes, 0);
  const structured = logs.filter((l) => l.structured).reduce((s, l) => s + l.minutes, 0);
  const thisYear = logs.filter((l) => l.date.startsWith(`${year}-`)).reduce((s, l) => s + l.minutes, 0);
  return {
    institute,
    requirement: req ? { id: req.id, memberClass: req.memberClass, totalMinutes: req.totalMinutes, structuredMinutes: req.structuredMinutes, perYearMinutes: req.perYearMinutes, verified: !!req.verifiedAt, source: req.source } : null,
    block,
    completedMinutes: completed,
    structuredMinutes: structured,
    currentYearMinutes: thisYear,
    shortfall: req
      ? { totalMinutes: Math.max(0, req.totalMinutes - completed), structuredMinutes: Math.max(0, req.structuredMinutes - structured), yearMinutes: Math.max(0, req.perYearMinutes - thisYear) }
      : { totalMinutes: 0, structuredMinutes: 0, yearMinutes: 0 },
  };
}

const cpeInput = z.object({
  date: zIso,
  minutes: z.coerce.number().int().min(15, "At least 15 minutes").max(24 * 60 * 5),
  structured: z.boolean().default(true),
  provider: z.string().trim().max(200).default(""),
  topic: z.string().trim().min(2, "Enter the topic").max(300),
});
export type CpeInput = z.input<typeof cpeInput>;

/** Log CPE for myself (HR may log for anyone, e.g. from a certificate handed in). */
export async function addCpeLog(actor: Actor, input: CpeInput & { userId?: string }, certificate?: { name: string; data: Buffer }) {
  const me = staffId(actor);
  const userId = input.userId ?? me;
  if (userId !== me && !can(actor, "hr.records.manage")) throw forbidden();
  const p = parse(cpeInput, input);
  if (p.date > todayIst()) throw ruleViolation("CPE cannot be logged for a future date.");
  return transaction(async (tx) => {
    const doc = certificate ? await storeHrDocument(tx, actor, { segments: ["cpe", userId], fileName: certificate.name, data: certificate.data, kind: "CERTIFICATE", employeeUserId: userId, sourceType: "UPLOAD" }) : null;
    const row = await tx.cPELog.create({ data: { ...p, userId, certificateDocId: doc?.id ?? null, createdById: me } });
    await writeAudit(tx, actor, { entityType: "CPELog", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
}

export async function deleteCpeLog(actor: Actor, logId: string) {
  const me = staffId(actor);
  const row = await db().cPELog.findUnique({ where: { id: logId } });
  if (!row) throw notFound("CPE entry");
  if (row.userId !== me && !can(actor, "hr.records.manage")) throw forbidden();
  await transaction(async (tx) => {
    await tx.cPELog.delete({ where: { id: logId } });
    await writeAudit(tx, actor, { entityType: "CPELog", entityId: logId, action: "DELETE", before: row });
  });
}

/** "Training & CPE" work entries (categories that feed CPE) not yet in the log: the user confirms each. */
export async function cpeSuggestions(actor: Actor, today = todayIst()) {
  const me = staffId(actor);
  const linked = (await db().cPELog.findMany({ where: { userId: me, workEntryId: { not: null } }, select: { workEntryId: true } })).map((l) => l.workEntryId!);
  return db().workEntry.findMany({
    where: { userId: me, deletedAt: null, date: { gte: addDays(today, -365) }, internalCategory: { feedsCpe: true }, id: { notIn: linked } },
    select: { id: true, date: true, minutes: true, description: true },
    orderBy: { date: "desc" },
    take: 50,
  });
}

export async function confirmCpeSuggestion(actor: Actor, workEntryId: string, input: { structured: boolean; provider?: string; topic?: string }) {
  const me = staffId(actor);
  const e = await db().workEntry.findUnique({ where: { id: workEntryId }, include: { internalCategory: true } });
  if (!e || e.deletedAt || e.userId !== me) throw notFound("Work entry");
  if (!e.internalCategory?.feedsCpe) throw ruleViolation("Only Training & CPE entries can be added to the CPE log.");
  if (await db().cPELog.findFirst({ where: { workEntryId } })) throw ruleViolation("Already in your CPE log.");
  const topic = (input.topic ?? "").trim() || e.description.trim() || "Training & CPE";
  return transaction(async (tx) => {
    const row = await tx.cPELog.create({ data: { userId: me, date: e.date, minutes: e.minutes, structured: input.structured, provider: input.provider ?? "", topic: topic.slice(0, 300), workEntryId, createdById: me } });
    await writeAudit(tx, actor, { entityType: "CPELog", entityId: row.id, action: "CREATE_FROM_WORK", after: row });
    return row;
  });
}

/** My CPE: log, status against the requirement (if I am a qualified member) and suggestions. */
export async function myCpe(actor: Actor, today = todayIst()) {
  const me = staffId(actor);
  const institute = (await qualifiedMembers([me])).get(me) ?? null;
  const [logs, suggestions] = await Promise.all([
    db().cPELog.findMany({ where: { userId: me }, orderBy: { date: "desc" }, take: 200 }),
    cpeSuggestions(actor, today),
  ]);
  return { institute, status: institute ? await cpeStatus(me, institute, today) : null, logs, suggestions };
}

/** CPE status of every qualified member the actor may see (HR/Partner firm, Manager team). */
export async function cpeOverview(actor: Actor, today = todayIst()) {
  const scope = authorize(actor, "hr.records.view");
  if (scope === "self") throw forbidden();
  const people = await db().user.findMany({ where: userWhere(actor, scope), select: { id: true, displayName: true } });
  const members = await qualifiedMembers(people.map((p) => p.id));
  const out = [];
  for (const p of people) {
    const inst = members.get(p.id);
    if (inst) out.push({ userId: p.id, name: p.displayName, ...(await cpeStatus(p.id, inst, today)) });
  }
  return out;
}

/** Scheduled job: warn members (and HR) with a shortfall when the block year end is near. */
export async function runCpeShortfall(today = todayIst()) {
  const alertDays = await getSetting<number>("cpe.shortfallAlertDays", 90);
  const members = await qualifiedMembers();
  const hr = await hrPeople();
  let alerted = 0;
  for (const [userId, institute] of members) {
    const s = await cpeStatus(userId, institute, today);
    if (!s.block || !s.requirement) continue;
    const yearEndDays = diffDays(today, `${parseIso(today).y}-12-31`);
    const blockShort = s.shortfall.totalMinutes > 0 || s.shortfall.structuredMinutes > 0;
    const yearShort = s.shortfall.yearMinutes > 0;
    if (!((blockShort && s.block.daysLeft <= alertDays) || (yearShort && yearEndDays <= alertDays))) continue;
    const hrs = (m: number) => Math.round((m / 60) * 10) / 10;
    const body = [
      blockShort ? `Block ${s.block.fromYear}-${s.block.toYear}: ${hrs(s.shortfall.totalMinutes)} hrs short (${hrs(s.shortfall.structuredMinutes)} structured).` : "",
      yearShort ? `This year: ${hrs(s.shortfall.yearMinutes)} hrs short of the yearly minimum.` : "",
      s.requirement.verified ? "" : "Requirement not yet verified by a Partner.",
    ].filter(Boolean).join(" ");
    alerted += await notifyUsers([userId], { kind: "CPE", title: "CPE shortfall", body, link: "/me/growth#cpe", dedupeKey: `cpe-short-${userId}-${today.slice(0, 7)}` });
    const name = (await namesOf([userId])).get(userId) ?? "";
    await notifyUsers(hr, { kind: "CPE", title: `CPE shortfall: ${name}`, body, link: "/hr/appraisals/growth", dedupeKey: `cpe-short-hr-${userId}-${today.slice(0, 7)}` });
  }
  return { members: members.size, alerted };
}

// ---- Internal training calendar and attendance

const sessionInput = z.object({
  title: z.string().trim().min(2, "Give a title").max(200),
  date: zIso,
  minutes: z.coerce.number().int().min(15).max(24 * 60),
  trainer: z.string().trim().max(200).default(""),
  cpeEligible: z.boolean().default(false),
});

const canRunTraining = (a: Actor) => isHrOrPartner(a) || (a.kind === "USER" && a.role === "MANAGER");

export async function createTrainingSession(actor: Actor, input: z.input<typeof sessionInput>) {
  if (!canRunTraining(actor)) throw forbidden();
  const p = parse(sessionInput, input);
  return transaction(async (tx) => {
    const s = await tx.trainingSession.create({ data: { ...p, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "TrainingSession", entityId: s.id, action: "CREATE", after: s });
    return s;
  });
}

/** Mark who attended. CPE-eligible sessions go straight into qualified attendees' CPE logs. */
export async function markAttendance(actor: Actor, sessionId: string, userIds: string[]) {
  if (!canRunTraining(actor)) throw forbidden();
  const s = await db().trainingSession.findUnique({ where: { id: sessionId } });
  if (!s) throw notFound("Training session");
  if (s.date > todayIst()) throw ruleViolation("Attendance is marked on or after the session date.");
  const members = s.cpeEligible ? await qualifiedMembers(userIds) : new Map<string, string>();
  await transaction(async (tx) => {
    for (const userId of [...new Set(userIds)]) {
      await tx.trainingAttendance.upsert({ where: { sessionId_userId: { sessionId, userId } }, create: { sessionId, userId, attended: true, createdById: idOf(actor) }, update: { attended: true, updatedById: idOf(actor) } });
      if (members.has(userId) && !(await tx.cPELog.findFirst({ where: { userId, date: s.date, topic: s.title, provider: "Internal training" } }))) {
        await tx.cPELog.create({ data: { userId, date: s.date, minutes: s.minutes, structured: true, provider: "Internal training", topic: s.title, createdById: idOf(actor) } });
      }
    }
    await writeAudit(tx, actor, { entityType: "TrainingSession", entityId: sessionId, action: "ATTENDANCE", after: { userIds } });
  });
}

export async function listTraining(actor: Actor) {
  const me = staffId(actor);
  const sessions = await db().trainingSession.findMany({ orderBy: { date: "desc" }, take: 100 });
  const att = await db().trainingAttendance.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) }, attended: true } });
  return sessions.map((s) => {
    const mine = att.filter((a) => a.sessionId === s.id);
    return { ...s, attendees: mine.length, attendeeIds: canRunTraining(actor) ? mine.map((a) => a.userId) : [], iAttended: mine.some((a) => a.userId === me) };
  });
}

// ---- Skill matrix

export async function listSkills() {
  return db().skill.findMany({ orderBy: [{ serviceLine: "asc" }, { name: "asc" }] });
}

export async function addSkill(actor: Actor, name: string, serviceLine: string) {
  if (!isHrOrPartner(actor)) throw forbidden();
  const n = name.trim();
  if (n.length < 2) throw ruleViolation("Enter the skill name.");
  if (await db().skill.findUnique({ where: { name: n } })) throw ruleViolation("That skill already exists.");
  return transaction(async (tx) => {
    const s = await tx.skill.create({ data: { name: n, serviceLine, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Skill", entityId: s.id, action: "CREATE", after: s });
    return s;
  });
}

export const SKILL_LEVELS: Record<number, string> = { 1: "Learning", 2: "Can do with review", 3: "Independent", 4: "Can review / train" };

/** Set a skill level: myself (self-assessment), my Manager (team), HR or a Partner. 0 removes it. */
export async function setSkillLevel(actor: Actor, userId: string, skillId: string, level: number) {
  const me = staffId(actor);
  if (!Number.isInteger(level) || level < 0 || level > 4) throw ruleViolation("Level must be 0 to 4.");
  if (userId !== me && !(await personInScope(actor, "hr.records.view", userId))) throw forbidden();
  if (userId !== me && scopeOf(actor, "hr.records.view") === "self") throw forbidden();
  if (!(await db().skill.findUnique({ where: { id: skillId } }))) throw notFound("Skill");
  const before = await db().employeeSkill.findUnique({ where: { userId_skillId: { userId, skillId } } });
  await transaction(async (tx) => {
    if (level === 0) {
      if (before) await tx.employeeSkill.delete({ where: { id: before.id } });
    } else {
      await tx.employeeSkill.upsert({ where: { userId_skillId: { userId, skillId } }, create: { userId, skillId, level, createdById: me }, update: { level, updatedById: me } });
    }
    await writeAudit(tx, actor, { entityType: "EmployeeSkill", entityId: `${userId}:${skillId}`, action: "SET_LEVEL", before: { level: before?.level ?? 0 }, after: { level } });
  });
}

/**
 * Skill matrix by service line for allocation views: people the actor may see (hr.records.view scope;
 * Staff/Articles see only themselves) × skills, with levels 1–4.
 */
export async function skillMatrix(actor: Actor, opts: { serviceLine?: string } = {}) {
  const scope = authorize(actor, "hr.records.view");
  const [skills, people] = await Promise.all([
    db().skill.findMany({ where: opts.serviceLine ? { serviceLine: opts.serviceLine } : {}, orderBy: [{ serviceLine: "asc" }, { name: "asc" }] }),
    db().user.findMany({ where: { AND: [userWhere(actor, scope), { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }] }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: "asc" } }),
  ]);
  const levels = await db().employeeSkill.findMany({ where: { userId: { in: people.map((p) => p.id) }, skillId: { in: skills.map((s) => s.id) } } });
  return {
    skills,
    people: people.map((p) => ({ userId: p.id, name: p.displayName, role: p.role, levels: Object.fromEntries(levels.filter((l) => l.userId === p.id).map((l) => [l.skillId, l.level])) as Record<string, number> })),
  };
}

export async function mySkills(actor: Actor) {
  const me = staffId(actor);
  const [skills, levels] = await Promise.all([listSkills(), db().employeeSkill.findMany({ where: { userId: me } })]);
  const byId = new Map(levels.map((l) => [l.skillId, l.level]));
  return skills.map((s) => ({ ...s, level: byId.get(s.id) ?? 0 }));
}
