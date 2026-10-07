import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, scopeOf } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { renderTemplateFor } from "../../documents/library";
import { readStoredFile } from "../../lib/storage";
import { todayIst } from "../../lib/dates";
import { notifyUsers } from "../notifications/service";
import { idOf, latestVersion, requireWrite, staffId, storeHrDocument, zIso } from "./common";
import { DEFAULT_LETTERS, renderLetterFile } from "./letters";

// ---------------------------------------------------------------------------
// Recruitment and onboarding (spec 11.6, P3-19)
// ---------------------------------------------------------------------------

export const STAGES = ["APPLIED", "SCREENING", "TEST", "INTERVIEW", "OFFER", "JOINED", "REJECTED"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = { APPLIED: "Applied", SCREENING: "Screening", TEST: "Test", INTERVIEW: "Interview", OFFER: "Offer", JOINED: "Joined", REJECTED: "Rejected" };
const PIPELINE: Stage[] = ["APPLIED", "SCREENING", "TEST", "INTERVIEW", "OFFER", "JOINED"];

/**
 * Pipeline rule: forward only (a stage may be skipped, e.g. no test for an article), JOINED only from
 * OFFER, REJECTED from any open stage; JOINED and REJECTED are final.
 */
export function canMoveStage(from: Stage, to: Stage): { ok: true } | { ok: false; reason: string } {
  if (from === "JOINED" || from === "REJECTED") return { ok: false, reason: "This candidate's pipeline is closed." };
  if (to === from) return { ok: false, reason: "Already at this stage." };
  if (to === "REJECTED") return { ok: true };
  if (to === "JOINED" && from !== "OFFER") return { ok: false, reason: "Only a candidate with an offer can join." };
  if (PIPELINE.indexOf(to) < PIPELINE.indexOf(from)) return { ok: false, reason: "The pipeline moves forward only." };
  return { ok: true };
}

/** Onboarding checklist created when a candidate joins (spec 11.6). Creating the login stays in People. */
export const ONBOARDING_ITEMS: { code: string; label: string; articleOnly?: boolean }[] = [
  { code: "DOCUMENTS", label: "Documents collected (KYC, certificates, photographs)" },
  { code: "LAPTOP_ACCESS", label: "Laptop and system access issued" },
  { code: "CLIENT_TEAM", label: "Client-team allocation done" },
  { code: "ARTICLESHIP_REGISTRATION", label: "Articleship registered with the institute", articleOnly: true },
  { code: "INDUCTION", label: "Induction training completed" },
];

const openingInput = z.object({
  title: z.string().trim().min(2, "Give the opening a title").max(200),
  kind: z.enum(["STAFF", "ARTICLE"]).default("STAFF"),
  ownerId: z.string().nullish(),
  openedAt: zIso,
});
const candidateInput = z.object({
  openingId: z.string().min(1),
  name: z.string().trim().min(2, "Enter the candidate's name").max(200),
  email: z.string().trim().email("Enter a valid email").nullish().or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(20).nullish(),
  source: z.string().trim().max(100).default(""),
});
const interviewInput = z.object({
  interviewerId: z.string().min(1, "Choose the interviewer"),
  scheduledAt: zIso,
});
const scorecardInput = z.object({
  scores: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  recommendation: z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]),
  notes: z.string().max(4000).default(""),
});
export const SCORE_AREAS = ["Technical knowledge", "Communication", "Attitude", "Practical exposure"] as const;

/** Managers read recruitment (team_read); Partner and HR manage it. */
function canSee(actor: Actor) {
  return scopeOf(actor, "recruitment.manage") !== "none";
}

export async function createOpening(actor: Actor, input: z.input<typeof openingInput>) {
  requireWrite(actor, "recruitment.manage");
  const p = parse(openingInput, input);
  return transaction(async (tx) => {
    const o = await tx.opening.create({ data: { ...p, ownerId: p.ownerId ?? idOf(actor), createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Opening", entityId: o.id, action: "CREATE", after: o });
    return o;
  });
}

export async function closeOpening(actor: Actor, openingId: string, status: "FILLED" | "CLOSED" | "OPEN") {
  requireWrite(actor, "recruitment.manage");
  const o = await db().opening.findUnique({ where: { id: openingId } });
  if (!o) throw notFound("Opening");
  await transaction(async (tx) => {
    const after = await tx.opening.update({ where: { id: openingId }, data: { status, closedAt: status === "OPEN" ? null : todayIst(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Opening", entityId: openingId, action: "STATUS", before: o, after });
  });
}

export async function listOpenings(actor: Actor) {
  authorize(actor, "recruitment.manage");
  const rows = await db().opening.findMany({ include: { candidates: { select: { stage: true } } }, orderBy: [{ status: "desc" }, { openedAt: "desc" }] });
  return rows.map((o) => ({ ...o, counts: Object.fromEntries(STAGES.map((s) => [s, o.candidates.filter((c) => c.stage === s).length])) as Record<Stage, number> }));
}

export async function getOpening(actor: Actor, openingId: string) {
  authorize(actor, "recruitment.manage");
  const o = await db().opening.findUnique({ where: { id: openingId }, include: { candidates: { orderBy: { createdAt: "asc" }, include: { interviews: true } } } });
  if (!o) throw notFound("Opening");
  return o;
}

export async function addCandidate(actor: Actor, input: z.input<typeof candidateInput>) {
  requireWrite(actor, "recruitment.manage");
  const p = parse(candidateInput, input);
  const o = await db().opening.findUnique({ where: { id: p.openingId } });
  if (!o) throw notFound("Opening");
  if (o.status !== "OPEN") throw ruleViolation("This opening is closed.");
  return transaction(async (tx) => {
    const c = await tx.candidate.create({ data: { ...p, email: p.email ?? null, phone: p.phone ?? null, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Candidate", entityId: c.id, action: "CREATE", after: c });
    return c;
  });
}

export async function updateCandidate(actor: Actor, candidateId: string, input: Partial<z.input<typeof candidateInput>>) {
  requireWrite(actor, "recruitment.manage");
  const p = parsePartial(candidateInput.omit({ openingId: true }), input);
  const before = await db().candidate.findUnique({ where: { id: candidateId } });
  if (!before) throw notFound("Candidate");
  return transaction(async (tx) => {
    const after = await tx.candidate.update({ where: { id: candidateId }, data: { ...p, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Candidate", entityId: candidateId, action: "UPDATE", before, after });
    return after;
  });
}

/** Candidate detail: HR/Partner always; a Manager (read-only) or any interviewer sees it too. */
export async function getCandidate(actor: Actor, candidateId: string) {
  const c = await db().candidate.findUnique({ where: { id: candidateId }, include: { opening: true, interviews: { orderBy: { scheduledAt: "asc" } } } });
  if (!c) throw notFound("Candidate");
  const interviewer = actor.kind === "USER" && c.interviews.some((i) => i.interviewerId === actor.userId);
  if (!canSee(actor) && !interviewer) throw forbidden();
  const onboarding = c.joinedUserId ? await db().employeeOnboardingItem.findMany({ where: { userId: c.joinedUserId }, orderBy: { createdAt: "asc" } }) : [];
  return { ...c, onboarding };
}

/** Move a candidate along the pipeline. JOINED needs the user account (created in People) to link. */
export async function moveCandidate(actor: Actor, candidateId: string, to: Stage, opts: { reason?: string; joinedUserId?: string } = {}) {
  requireWrite(actor, "recruitment.manage");
  const c = await db().candidate.findUnique({ where: { id: candidateId }, include: { opening: true } });
  if (!c) throw notFound("Candidate");
  const check = canMoveStage(c.stage as Stage, to);
  if (!check.ok) throw ruleViolation(check.reason);
  if (to === "REJECTED" && !opts.reason?.trim()) throw new DomainError("VALIDATION", "Give a reason for rejecting.", { reason: "Required" });
  let joinedUserId: string | null = null;
  if (to === "JOINED") {
    if (!opts.joinedUserId) throw new DomainError("VALIDATION", "Create the person's login in People first, then choose it here.", { joinedUserId: "Required" });
    const u = await db().user.findUnique({ where: { id: opts.joinedUserId } });
    if (!u || u.isSystem) throw notFound("User");
    const taken = await db().candidate.findFirst({ where: { joinedUserId: u.id, id: { not: candidateId } } });
    if (taken) throw ruleViolation("That login is already linked to another candidate.");
    joinedUserId = u.id;
  }
  await transaction(async (tx) => {
    const after = await tx.candidate.update({
      where: { id: candidateId },
      data: { stage: to, rejectedReason: to === "REJECTED" ? opts.reason!.trim() : c.rejectedReason, joinedUserId: joinedUserId ?? c.joinedUserId, updatedById: idOf(actor) },
    });
    if (joinedUserId) {
      for (const item of ONBOARDING_ITEMS.filter((i) => !i.articleOnly || c.opening.kind === "ARTICLE")) {
        await tx.employeeOnboardingItem.upsert({
          where: { userId_code: { userId: joinedUserId, code: item.code } },
          create: { userId: joinedUserId, code: item.code, label: item.label, createdById: idOf(actor) },
          update: {},
        });
      }
    }
    await writeAudit(tx, actor, { entityType: "Candidate", entityId: candidateId, action: "STAGE", before: { stage: c.stage }, after: { stage: after.stage, rejectedReason: after.rejectedReason, joinedUserId: after.joinedUserId } });
  });
}

export async function toggleOnboardingItem(actor: Actor, itemId: string, done: boolean) {
  requireWrite(actor, "recruitment.manage");
  const item = await db().employeeOnboardingItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound("Checklist item");
  await transaction(async (tx) => {
    await tx.employeeOnboardingItem.update({ where: { id: itemId }, data: { done, doneAt: done ? new Date() : null, doneById: done ? idOf(actor) : null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "EmployeeOnboardingItem", entityId: itemId, action: done ? "DONE" : "UNDONE", after: { code: item.code } });
  });
}

/** Onboarding checklists still open (for the recruitment page). */
export async function openOnboarding(actor: Actor) {
  authorize(actor, "recruitment.manage");
  const items = await db().employeeOnboardingItem.findMany({ where: { done: false }, orderBy: { createdAt: "asc" } });
  return items;
}

export async function scheduleInterview(actor: Actor, candidateId: string, input: z.input<typeof interviewInput>) {
  requireWrite(actor, "recruitment.manage");
  const p = parse(interviewInput, input);
  const c = await db().candidate.findUnique({ where: { id: candidateId } });
  if (!c) throw notFound("Candidate");
  if (c.stage === "JOINED" || c.stage === "REJECTED") throw ruleViolation("This candidate's pipeline is closed.");
  const iv = await transaction(async (tx) => {
    const row = await tx.interview.create({ data: { candidateId, interviewerId: p.interviewerId, scheduledAt: p.scheduledAt, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Interview", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
  await notifyUsers([p.interviewerId], { kind: "INTERVIEW", title: `Interview: ${c.name}`, body: `Scheduled for ${p.scheduledAt}. Record your scorecard after the interview.`, link: `/hr/recruitment/candidates/${c.id}`, dedupeKey: `interview-${iv.id}` });
  return iv;
}

/** Scorecard by the interviewer (any staff member asked to interview) or by HR / Partner. */
export async function recordScorecard(actor: Actor, interviewId: string, input: z.input<typeof scorecardInput>) {
  const me = staffId(actor);
  const p = parse(scorecardInput, input);
  const iv = await db().interview.findUnique({ where: { id: interviewId } });
  if (!iv) throw notFound("Interview");
  if (iv.interviewerId !== me) requireWrite(actor, "recruitment.manage");
  return transaction(async (tx) => {
    const after = await tx.interview.update({ where: { id: interviewId }, data: { scoreJson: JSON.stringify(p.scores), recommendation: p.recommendation, notes: p.notes, updatedById: me } });
    await writeAudit(tx, actor, { entityType: "Interview", entityId: interviewId, action: "SCORECARD", before: iv, after });
    return after;
  });
}

/** Interviews assigned to me that still need a scorecard. */
export async function myInterviews(actor: Actor) {
  const me = staffId(actor);
  return db().interview.findMany({ where: { interviewerId: me, recommendation: null }, include: { candidate: { select: { id: true, name: true, opening: { select: { title: true } } } } }, orderBy: { scheduledAt: "asc" } });
}

const offerInput = z.object({
  position: z.string().trim().min(1, "Required"),
  ctc: z.string().trim().min(1, "Required"),
  joiningDate: zIso,
  acceptBy: zIso,
  allowMissing: z.boolean().default(false),
});

/** Offer letter from the HR_OFFER template (spec 11.6); stored with the candidate. */
export async function generateOfferLetter(actor: Actor, candidateId: string, input: z.input<typeof offerInput>) {
  requireWrite(actor, "recruitment.manage");
  const p = parse(offerInput, input);
  const c = await db().candidate.findUnique({ where: { id: candidateId } });
  if (!c) throw notFound("Candidate");
  if (!["INTERVIEW", "OFFER", "TEST", "SCREENING"].includes(c.stage)) throw ruleViolation("Offer letters are made for candidates still in the pipeline.");
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]}-${y}`;
  };
  const r = await renderTemplateFor("HR_OFFER", DEFAULT_LETTERS.OFFER, { extra: { candidateName: c.name, position: p.position, ctc: p.ctc, joiningDate: fmt(p.joiningDate), acceptBy: fmt(p.acceptBy) } });
  if (r.missing.length && !p.allowMissing) throw new DomainError("VALIDATION", `These fields are blank: ${r.missing.join(", ")}.`, { allowMissing: r.missing.join(", ") });
  await transaction(async (tx) => {
    const doc = await storeHrDocument(tx, actor, { segments: ["recruitment"], fileName: `Offer letter - ${c.name}.txt`, data: Buffer.from(r.text, "utf8"), kind: "OFFER" });
    await tx.candidate.update({ where: { id: candidateId }, data: { offerLetterDocId: doc.id, stage: "OFFER", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Candidate", entityId: candidateId, action: "OFFER_LETTER", before: { stage: c.stage }, after: { stage: "OFFER", templateVersionId: r.templateVersionId } });
  });
  return { missing: r.missing };
}

export async function offerLetterDownload(actor: Actor, candidateId: string, format: "pdf" | "docx") {
  authorize(actor, "recruitment.manage");
  const c = await db().candidate.findUnique({ where: { id: candidateId } });
  if (!c?.offerLetterDocId) throw notFound("Offer letter");
  const v = await latestVersion(c.offerLetterDocId);
  if (!v) throw notFound("Offer letter");
  const file = await renderLetterFile((await readStoredFile(v.storagePath)).toString("utf8"), "Offer letter", format);
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Candidate", entityId: candidateId, action: "DOWNLOAD_OFFER", after: { format } }));
  return { ...file, fileName: `Offer letter - ${c.name}.${format}` };
}
