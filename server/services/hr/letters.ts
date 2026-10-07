import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { renderTemplateFor } from "../../documents/library";
import { buildPdf } from "../../documents/pdf";
import { buildDocx } from "../../documents/docx";
import { readStoredFile } from "../../lib/storage";
import { notifyUsers } from "../notifications/service";
import { idOf, latestVersion, storeHrDocument, zIso } from "./common";

// ---------------------------------------------------------------------------
// HR letters (spec 11.13, P3-25)
// ---------------------------------------------------------------------------

export const LETTER_KINDS = ["OFFER", "APPOINTMENT", "CONFIRMATION", "INCREMENT", "EXPERIENCE", "RELIEVING"] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];
export const LETTER_LABELS: Record<LetterKind, string> = {
  OFFER: "Offer letter", APPOINTMENT: "Appointment letter", CONFIRMATION: "Confirmation letter",
  INCREMENT: "Increment letter", EXPERIENCE: "Experience certificate", RELIEVING: "Relieving letter",
};
/** Letters that carry pay figures: viewing them is a salary view (invariant 5). */
const PAY_LETTERS: LetterKind[] = ["OFFER", "APPOINTMENT", "INCREMENT"];

/** Extra merge fields each letter asks HR to type ({{extra.<key>}}). Firm templates for HR_<KIND> must use these keys (the defaults in doc-templates do). */
export const LETTER_EXTRA_FIELDS: Record<LetterKind, { key: string; label: string; type?: "date" }[]> = {
  OFFER: [{ key: "position", label: "Position" }, { key: "ctc", label: "Annual CTC / monthly stipend" }, { key: "joiningDate", label: "Joining date", type: "date" }, { key: "acceptBy", label: "Accept by", type: "date" }],
  APPOINTMENT: [{ key: "position", label: "Position" }, { key: "ctc", label: "Annual CTC / monthly stipend" }, { key: "probationMonths", label: "Probation (months)" }],
  CONFIRMATION: [{ key: "confirmationDate", label: "Confirmed from", type: "date" }],
  INCREMENT: [{ key: "newCtc", label: "Revised CTC" }, { key: "effectiveFrom", label: "Effective from", type: "date" }],
  EXPERIENCE: [{ key: "lastWorkingDate", label: "Last working date", type: "date" }, { key: "position", label: "Position held" }],
  RELIEVING: [{ key: "lastWorkingDate", label: "Last working date", type: "date" }, { key: "resignationDate", label: "Resignation date", type: "date" }],
};

/** Built-in default bodies, used until the firm approves its own template (D-54). */
export const DEFAULT_LETTERS: Record<LetterKind, string> = {
  OFFER: `Date: {{today.date}}

Dear {{extra.candidateName}},

We are pleased to offer you the position of {{extra.position}} with {{firm.name}}.

Your compensation will be {{extra.ctc}}. We would like you to join on {{extra.joiningDate}}.

Please confirm your acceptance by {{extra.acceptBy}}. This offer is subject to verification of your documents.

We look forward to working with you.

For {{firm.name}}

Authorised Signatory`,
  APPOINTMENT: `Date: {{today.date}}

Dear {{employee.name}},

Further to your acceptance of our offer, you are appointed as {{extra.position}} with {{firm.name}} with effect from {{employee.joiningDate}} (Employee code {{employee.employeeCode}}).

Your compensation will be {{extra.ctc}}. You will be on probation for {{extra.probationMonths}} months.

You will follow the firm's policies on leave, conduct, confidentiality and work from home, which form part of this appointment.

For {{firm.name}}

Authorised Signatory`,
  CONFIRMATION: `Date: {{today.date}}

Dear {{employee.name}},

We are pleased to confirm your services as {{employee.designation}} with {{firm.name}} with effect from {{extra.confirmationDate}}.

All other terms of your appointment remain unchanged.

For {{firm.name}}

Authorised Signatory`,
  INCREMENT: `Date: {{today.date}}

Dear {{employee.name}},

In recognition of your contribution, your compensation is revised to {{extra.newCtc}} with effect from {{extra.effectiveFrom}}.

All other terms of your employment remain unchanged. This letter is confidential.

For {{firm.name}}

Authorised Signatory`,
  EXPERIENCE: `Date: {{today.date}}

TO WHOM IT MAY CONCERN

This is to certify that {{employee.name}} (Employee code {{employee.employeeCode}}) worked with {{firm.name}} as {{extra.position}} from {{employee.joiningDate}} to {{extra.lastWorkingDate}}.

We wish them all the best in their future endeavours.

For {{firm.name}}

Authorised Signatory`,
  RELIEVING: `Date: {{today.date}}

Dear {{employee.name}},

This is with reference to your resignation dated {{extra.resignationDate}}. You are relieved from the services of {{firm.name}} at the close of business on {{extra.lastWorkingDate}}.

We confirm that your full and final settlement is being processed as per the firm's policy.

For {{firm.name}}

Authorised Signatory`,
};

const letterInput = z.object({
  userId: z.string().min(1, "Choose a person"),
  kind: z.enum(LETTER_KINDS),
  extra: z.record(z.string(), z.string()).default({}),
  allowMissing: z.boolean().default(false),
});
export type LetterInput = z.input<typeof letterInput>;

/** Who may generate letters: HR (hr.records.manage); exit letters also by exit.manage writers via exits.ts. */
function assertLetterWriter(actor: Actor) {
  if (!can(actor, "hr.records.manage")) throw forbidden();
}

export type PreparedLetter = { userId: string; displayName: string; kind: LetterKind; text: string; templateVersionId: string | null; missing: string[] };

/** Merge the template (reads only; call before any transaction). Callers check permissions first. */
export async function prepareLetter(input: { userId: string; kind: LetterKind; extra: Record<string, string>; allowMissing: boolean }): Promise<PreparedLetter> {
  const user = await db().user.findUnique({ where: { id: input.userId }, select: { id: true, displayName: true } });
  if (!user) throw notFound("Person");
  const extra = Object.fromEntries(Object.entries(input.extra).map(([k, v]) => [k, /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatIsoForLetter(v) : v]));
  const r = await renderTemplateFor(`HR_${input.kind}`, DEFAULT_LETTERS[input.kind], { userId: input.userId, extra });
  if (r.missing.length && !input.allowMissing) {
    throw new DomainError("VALIDATION", `These fields are blank: ${r.missing.join(", ")}. Fill them, or tick "Generate with gaps".`, { extra: r.missing.join(", ") });
  }
  return { userId: user.id, displayName: user.displayName, kind: input.kind, text: r.text, templateVersionId: r.templateVersionId, missing: r.missing };
}

/** Store the letter text and create the HRLetter row inside the caller's transaction. */
export async function persistLetter(tx: Tx, actor: Actor, l: PreparedLetter) {
  const doc = await storeHrDocument(tx, actor, {
    segments: ["letters"], fileName: `${LETTER_LABELS[l.kind]} - ${l.displayName}.txt`, data: Buffer.from(l.text, "utf8"), kind: l.kind, employeeUserId: l.userId,
  });
  const letter = await tx.hRLetter.create({ data: { userId: l.userId, kind: l.kind, templateVersionId: l.templateVersionId, documentId: doc.id, createdById: idOf(actor) } });
  await writeAudit(tx, actor, { entityType: "HRLetter", entityId: letter.id, action: "CREATE", after: { userId: l.userId, kind: l.kind, missing: l.missing } });
  return { letter, missing: l.missing };
}

function formatIsoForLetter(iso: string) {
  const [y, m, d] = iso.split("-");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

export async function generateLetter(actor: Actor, input: LetterInput) {
  assertLetterWriter(actor);
  const p = parse(letterInput, input);
  const prepared = await prepareLetter(p);
  return transaction((tx) => persistLetter(tx, actor, prepared));
}

export async function markLetterIssued(actor: Actor, letterId: string) {
  assertLetterWriter(actor);
  const l = await db().hRLetter.findUnique({ where: { id: letterId } });
  if (!l) throw notFound("Letter");
  if (l.issuedAt) throw ruleViolation("Already marked as issued.");
  await transaction(async (tx) => {
    await tx.hRLetter.update({ where: { id: letterId }, data: { issuedAt: new Date(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "HRLetter", entityId: letterId, action: "ISSUE" });
  });
  await notifyUsers([l.userId], { kind: "HR_LETTER", title: `${LETTER_LABELS[l.kind as LetterKind] ?? "Letter"} issued`, body: "Download it from My profile → Goals, CPE & skills.", link: "/me/growth", dedupeKey: `hr-letter-${l.id}` });
}

/** Letters list: HR sees all (optionally one person); everyone else sees only their own issued letters. */
export async function listLetters(actor: Actor, opts: { userId?: string } = {}) {
  if (can(actor, "hr.records.manage")) {
    return db().hRLetter.findMany({ where: opts.userId ? { userId: opts.userId } : {}, orderBy: { createdAt: "desc" }, take: 300 });
  }
  if (actor.kind !== "USER") throw forbidden();
  return db().hRLetter.findMany({ where: { userId: actor.userId, issuedAt: { not: null } }, orderBy: { createdAt: "desc" } });
}

/** Text of a stored letter, with access check (self, HR, Partner). Pay letters viewed by others are salary views. */
async function letterText(actor: Actor, letterId: string) {
  const l = await db().hRLetter.findUnique({ where: { id: letterId } });
  if (!l || !l.documentId) throw notFound("Letter");
  const self = actor.kind === "USER" && actor.userId === l.userId;
  if (self && !l.issuedAt) throw notFound("Letter");
  if (!self && !can(actor, "hr.records.manage") && actor.role !== "PARTNER") throw forbidden();
  if (!self && PAY_LETTERS.includes(l.kind as LetterKind)) await logSensitiveView(actor, "SALARY", "HRLetter", l.id, l.kind);
  const v = await latestVersion(l.documentId);
  if (!v) throw notFound("Letter file");
  const user = await db().user.findUnique({ where: { id: l.userId }, select: { displayName: true } });
  return { text: (await readStoredFile(v.storagePath)).toString("utf8"), title: LETTER_LABELS[l.kind as LetterKind] ?? "Letter", who: user?.displayName ?? "employee", letter: l };
}

/** Render letter text as PDF or Word with the firm letterhead. */
export async function renderLetterFile(text: string, title: string, format: "pdf" | "docx") {
  const firm = await db().firmProfile.findFirst();
  const header = firm ? [firm.name, firm.address, [firm.email, firm.phone].filter(Boolean).join(" · ")].filter(Boolean) : [];
  if (format === "docx") return { body: await buildDocx({ title, header, body: text }), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const blocks = text.split(/\n{2,}/).map((p) => ({ type: "text" as const, text: p.trim() }));
  return { body: await buildPdf({ title, header, blocks }), contentType: "application/pdf" };
}

export async function letterDownload(actor: Actor, letterId: string, format: "pdf" | "docx") {
  const t = await letterText(actor, letterId);
  const file = await renderLetterFile(t.text, t.title, format);
  await transaction((tx) => writeAudit(tx, actor, { entityType: "HRLetter", entityId: letterId, action: "DOWNLOAD", after: { format } }));
  return { ...file, fileName: `${t.title} - ${t.who}.${format}` };
}

export async function letterPreview(actor: Actor, letterId: string) {
  return (await letterText(actor, letterId)).text;
}

// ---------------------------------------------------------------------------
// Policy library and acknowledgments (spec 11.13)
// ---------------------------------------------------------------------------

export const POLICY_KINDS = ["LEAVE", "CONDUCT", "CONFIDENTIALITY", "WFH", "OTHER"] as const;
export const POLICY_LABELS: Record<(typeof POLICY_KINDS)[number], string> = { LEAVE: "Leave", CONDUCT: "Code of conduct", CONFIDENTIALITY: "Confidentiality", WFH: "Work from home", OTHER: "Other" };

const policyInput = z.object({
  title: z.string().trim().min(2, "Give a title").max(200),
  kind: z.enum(POLICY_KINDS),
  body: z.string().trim().min(10, "Write the policy text (or a summary and where to find the full copy)"),
  effectiveFrom: zIso,
  requiresAck: z.boolean().default(true),
});
export type PolicyInput = z.input<typeof policyInput>;

/** Publish a policy. Same title + kind as an existing one → a new version (older versions stay for the record). */
export async function publishPolicy(actor: Actor, input: PolicyInput) {
  authorize(actor, "hr.records.manage");
  const p = parse(policyInput, input);
  const prev = await db().policyDocument.findFirst({ where: { title: p.title, kind: p.kind }, orderBy: { version: "desc" } });
  const row = await transaction(async (tx) => {
    const created = await tx.policyDocument.create({ data: { ...p, version: (prev?.version ?? 0) + 1, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "PolicyDocument", entityId: created.id, action: prev ? "NEW_VERSION" : "CREATE", after: { title: p.title, kind: p.kind, version: created.version } });
    return created;
  });
  if (row.requiresAck) {
    const people = await db().user.findMany({ where: { active: true, isSystem: false }, select: { id: true } });
    await notifyUsers(people.map((u) => u.id), { kind: "POLICY", title: `Please read and acknowledge: ${row.title} (v${row.version})`, link: "/me/growth#policies", dedupeKey: `policy-${row.id}` });
  }
  return row;
}

/** Latest version of each policy (title + kind). */
async function currentPolicies() {
  const all = await db().policyDocument.findMany({ orderBy: [{ title: "asc" }, { version: "desc" }] });
  const seen = new Set<string>();
  return all.filter((p) => {
    const k = `${p.kind}|${p.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Policy library for everyone, with the viewer's own acknowledgment state. */
export async function myPolicies(actor: Actor) {
  if (actor.kind !== "USER") throw forbidden();
  const current = await currentPolicies();
  const acks = await db().policyAcknowledgment.findMany({ where: { userId: actor.userId, policyId: { in: current.map((p) => p.id) } } });
  const byPolicy = new Map(acks.map((a) => [a.policyId, a.acknowledgedAt]));
  return current.map((p) => ({ ...p, acknowledgedAt: byPolicy.get(p.id) ?? null, outstanding: p.requiresAck && !byPolicy.has(p.id) }));
}

export async function outstandingAcknowledgments(actor: Actor) {
  return (await myPolicies(actor)).filter((p) => p.outstanding);
}

export async function acknowledgePolicy(actor: Actor, policyId: string) {
  if (actor.kind !== "USER") throw forbidden();
  const p = await db().policyDocument.findUnique({ where: { id: policyId } });
  if (!p) throw notFound("Policy");
  const current = (await currentPolicies()).find((c) => c.id === policyId);
  if (!current) throw ruleViolation("A newer version of this policy exists. Please acknowledge the latest one.");
  const existing = await db().policyAcknowledgment.findUnique({ where: { policyId_userId: { policyId, userId: actor.userId } } });
  if (existing) return existing;
  return transaction(async (tx) => {
    const a = await tx.policyAcknowledgment.create({ data: { policyId, userId: actor.userId, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "PolicyAcknowledgment", entityId: a.id, action: "ACKNOWLEDGE", after: { policyId, version: p.version } });
    return a;
  });
}

/** HR view: every current policy with acknowledged / outstanding counts and names. */
export async function policyStatus(actor: Actor) {
  authorize(actor, "hr.records.manage");
  const [current, people] = await Promise.all([currentPolicies(), db().user.findMany({ where: { active: true, isSystem: false }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })]);
  const acks = await db().policyAcknowledgment.findMany({ where: { policyId: { in: current.map((p) => p.id) } } });
  return current.map((p) => {
    const acked = new Set(acks.filter((a) => a.policyId === p.id).map((a) => a.userId));
    return { ...p, acknowledged: people.filter((u) => acked.has(u.id)).length, outstanding: p.requiresAck ? people.filter((u) => !acked.has(u.id)).map((u) => u.displayName) : [] };
  });
}
