import { z } from "zod";
import type { SalaryStructure } from "@/generated/prisma/client";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { forbidden, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { authorize, can } from "../../permissions/guards";
import { writeAudit, logSensitiveView } from "../../audit";
import { encrypt, encryptJson, decrypt, decryptJson } from "../../lib/crypto";
import { zIsoDate } from "../../domain/enums";
import { monthlyGross, type SalaryComponents } from "../../payroll-engine";
import { assertSalaryAccess, idOf, isSalaryAdmin } from "./common";
import { notifyUsers } from "../notifications/service";

export type StructureRow = {
  id: string;
  userId: string;
  effectiveFrom: string;
  kind: string;
  regime: string;
  status: string;
  components: SalaryComponents;
  monthlyGross: number;
  createdById: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
};

type RawStructure = SalaryStructure;

/** Decrypt a structure (callers have already checked salary access). Missing parts read as 0 (import writes all five). */
export function decryptStructure(s: RawStructure): StructureRow {
  const c = decryptJson<Partial<SalaryComponents>>(s.componentsEnc, "PII");
  const components: SalaryComponents = { basic: c.basic ?? 0, hra: c.hra ?? 0, special: c.special ?? 0, other: c.other ?? 0, variable: c.variable ?? 0 };
  return {
    id: s.id, userId: s.userId, effectiveFrom: s.effectiveFrom, kind: s.kind, regime: s.regime, status: s.status,
    components, monthlyGross: Number(decrypt(s.monthlyGrossPaiseEnc, "PII")), createdById: s.createdById, approvedById: s.approvedById, approvedAt: s.approvedAt,
  };
}

/** The approved structure in force on a date (approved revisions stay usable for past months even when superseded). */
export async function effectiveStructure(userId: string, date: string, tx?: Tx) {
  const s = await (tx ?? db()).salaryStructure.findFirst({
    where: { userId, effectiveFrom: { lte: date }, status: { in: ["APPROVED", "SUPERSEDED"] } },
    orderBy: [{ effectiveFrom: "desc" }, { approvedAt: "desc" }],
  });
  return s ? decryptStructure(s) : null;
}

const rupee = z.coerce.number().int().min(0);
const structureInput = z.object({
  userId: z.string().min(1),
  effectiveFrom: zIsoDate,
  kind: z.enum(["SALARY", "STIPEND"]).default("SALARY"),
  regime: z.enum(["NEW", "OLD"]).default("NEW"),
  basic: rupee,
  hra: rupee.default(0),
  special: rupee.default(0),
  other: rupee.default(0),
  variable: rupee.default(0),
});
export type StructureInput = z.input<typeof structureInput>;

/** HR (or a Partner) proposes a structure or revision as DRAFT; amounts in paise, encrypted at rest. */
export async function proposeStructure(actor: Actor, input: StructureInput) {
  if (!can(actor, "hr.records.manage") && !can(actor, "salary.revise.approve")) throw forbidden();
  const d = parse(structureInput, input);
  const user = await db().user.findUnique({ where: { id: d.userId } });
  if (!user || user.isSystem) throw notFound("User");
  if (d.basic <= 0) throw ruleViolation(d.kind === "STIPEND" ? "Enter the monthly stipend." : "Basic must be more than zero.");
  const components: SalaryComponents = { basic: d.basic, hra: d.kind === "STIPEND" ? 0 : d.hra, special: d.kind === "STIPEND" ? 0 : d.special, other: d.kind === "STIPEND" ? 0 : d.other, variable: d.kind === "STIPEND" ? 0 : d.variable };
  const row = await transaction(async (tx) => {
    const s = await tx.salaryStructure.create({
      data: {
        userId: d.userId, effectiveFrom: d.effectiveFrom, kind: d.kind, regime: d.regime, status: "DRAFT",
        componentsEnc: encryptJson(components, "PII"), monthlyGrossPaiseEnc: encrypt(String(monthlyGross(components)), "PII"), createdById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "SalaryStructure", entityId: s.id, action: "CREATE", after: { userId: s.userId, effectiveFrom: s.effectiveFrom, kind: s.kind, status: "DRAFT" } });
    return s;
  });
  const partners = await db().user.findMany({ where: { role: "PARTNER", active: true, id: { not: idOf(actor) ?? "" } }, select: { id: true } });
  await notifyUsers(partners.map((p) => p.id), { kind: "SALARY_REVISION", title: `Salary revision to approve: ${user.displayName} from ${d.effectiveFrom}`, link: "/hr/payroll/structures", entityType: "SalaryStructure", entityId: row.id, dedupeKey: `SAL|${row.id}` });
  return row;
}

/** A Partner approves a revision (spec 11.5). Nobody approves a revision they proposed (maker ≠ checker). */
export async function decideStructure(actor: Actor, id: string, approve: boolean) {
  authorize(actor, "salary.revise.approve");
  const s = await db().salaryStructure.findUnique({ where: { id } });
  if (!s) throw notFound("Salary structure");
  if (s.status !== "DRAFT") throw ruleViolation("This revision was already decided.");
  if (s.createdById && s.createdById === idOf(actor)) throw forbidden("You proposed this revision; another Partner must approve it.");
  if (actor.kind === "USER" && s.userId === actor.userId) throw forbidden("You cannot approve your own salary.");
  await transaction(async (tx) => {
    if (approve) {
      await tx.salaryStructure.updateMany({ where: { userId: s.userId, status: "APPROVED", effectiveFrom: { lte: s.effectiveFrom } }, data: { status: "SUPERSEDED", updatedById: idOf(actor) } });
      await tx.salaryStructure.update({ where: { id }, data: { status: "APPROVED", approvedById: idOf(actor), approvedAt: new Date(), updatedById: idOf(actor) } });
    } else {
      await tx.salaryStructure.delete({ where: { id } });
    }
    await writeAudit(tx, actor, { entityType: "SalaryStructure", entityId: id, action: approve ? "APPROVE" : "REJECT" });
  });
}

/** Structures of one person (HR/Partner, or the person themself). Viewing someone else's is logged. */
export async function listStructures(actor: Actor, userId: string) {
  assertSalaryAccess(actor, userId);
  const rows = await db().salaryStructure.findMany({ where: { userId, ...(isSalaryAdmin(actor) ? {} : { status: { in: ["APPROVED", "SUPERSEDED"] } }) }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  if (actor.kind === "USER" && actor.userId !== userId) await logSensitiveView(actor, "SALARY", "SalaryStructure", userId, "salary structures");
  return rows.map(decryptStructure);
}

/** Firm-wide overview for HR/Partner: each person's current structure and pending drafts. */
export async function structureOverview(actor: Actor, today: string) {
  if (!isSalaryAdmin(actor) || actor.kind === "PORTAL") throw forbidden();
  const users = await db().user.findMany({ where: { isSystem: false, active: true }, select: { id: true, displayName: true, role: true, employeeProfile: { select: { employeeCode: true, employeeCategory: true } } }, orderBy: { displayName: "asc" } });
  const all = await db().salaryStructure.findMany({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  await logSensitiveView(actor, "SALARY", "SalaryStructure", "*", "structure overview");
  return users.map((u) => {
    const mine = all.filter((s) => s.userId === u.id);
    const current = mine.find((s) => ["APPROVED", "SUPERSEDED"].includes(s.status) && s.effectiveFrom <= today) ?? null;
    const upcoming = mine.filter((s) => s.status === "APPROVED" && s.effectiveFrom > today).map(decryptStructure);
    return { user: u, current: current ? decryptStructure(current) : null, drafts: mine.filter((s) => s.status === "DRAFT").map(decryptStructure), upcoming };
  });
}
