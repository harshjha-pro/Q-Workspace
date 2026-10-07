import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can, requireStaff } from "../../permissions/guards";
import { assertClientAccess, taskWhere } from "../../permissions/scopes";
import { systemActor, type Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { nextCode, toSearch } from "../../lib/codes";
import { isIsoDate, todayIst } from "../../lib/dates";
import { displayState, type TaskStatus } from "../../compliance-engine";

/**
 * The firm's own compliance (spec 13.6, P3-31, D-16). The firm is an internal client (`isFirm`). Its statutory
 * returns (GST, TDS, PF, ESI, PT, advance tax) come from the compliance engine through the normal flags and GSTINs.
 * Firm-only obligations (membership / COP renewals, firm registration updates, PI insurance, peer review, office
 * licences) are ComplianceTypes with `isFirmOnly` and a MANUAL due-date rule.
 *
 * Engine gap (reported): `obligationsFor()` never emits firm-only types, and the nightly sync would mark any
 * compliance-typed task outside its obligations Not Applicable. Until the engine learns about firm-only types,
 * each firm-only instance is recorded here as a one-off task of the firm client (complianceTypeCode null, the type
 * code kept in `dueBasis` / `periodKey` as `FIRM:<code>:…`) so the sync leaves it alone.
 */
export const FIRM_PREFIX = "FIRM:";

/** The firm's internal client; created from the firm profile on first use (real installs). */
export async function ensureFirmClient(actor: Actor = systemActor()) {
  const existing = await db().client.findFirst({ where: { isFirm: true }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  const profile = await db().firmProfile.findFirst({ orderBy: { createdAt: "asc" } });
  const name = profile?.name ? `${profile.name} (Firm)` : "Our firm (internal)";
  return transaction(async (tx) => {
    const code = (await tx.client.count({ where: { code: "CL-0000" } })) ? await nextCode(tx, "client") : "CL-0000";
    const constitution = profile?.pan && profile.pan[3] === "F" ? "PARTNERSHIP" : profile?.pan && profile.pan[3] === "P" ? "PROPRIETORSHIP" : "PARTNERSHIP";
    const c = await tx.client.create({
      data: {
        code, name, searchName: toSearch(name), constitution, pan: profile?.pan || null, stateCode: profile?.stateCode || null, address: profile?.address ?? "",
        isFirm: true, onboardingDate: todayIst(), createdById: actor.kind === "USER" ? actor.userId : "system",
      },
    });
    await writeAudit(tx, actor, { entityType: "Client", entityId: c.id, action: "CREATE", after: { code, name, isFirm: true }, reason: "Firm set up as an internal client (spec 13.6)" });
    return c;
  });
}

/** Firm-only compliance types (Due-Date Master rows with isFirmOnly). */
export async function firmOnlyTypes() {
  return db().complianceType.findMany({ where: { isFirmOnly: true, active: true }, include: { rules: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 } }, orderBy: { sortOrder: "asc" } });
}

const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

/** The firm client's tasks (engine-generated and firm-only), in the viewer's task scope. */
export async function listFirmCompliance(actor: Actor, f: { includeClosed?: boolean } = {}) {
  requireStaff(actor);
  const scope = authorize(actor, "task.view");
  const firm = await ensureFirmClient(actor);
  const rows = await db().task.findMany({
    where: { AND: [taskWhere(actor, scope), { clientId: firm.id }, f.includeClosed ? {} : { status: { in: OPEN } }] },
    include: { assignments: { where: { toDate: null, role: { in: ["ASSIGNEE", "MAKER"] } }, include: { user: { select: { displayName: true } } } } },
    orderBy: [{ effectiveDueDate: "asc" }, { title: "asc" }],
    take: 1000,
  });
  const types = new Map((await db().complianceType.findMany({ select: { code: true, name: true } })).map((t) => [t.code, t.name]));
  const today = todayIst();
  return {
    firm: { id: firm.id, code: firm.code, name: firm.name },
    tasks: rows.map((t) => {
      const firmCode = t.dueBasis.startsWith(FIRM_PREFIX) ? t.dueBasis.slice(FIRM_PREFIX.length).split(" ")[0]! : null;
      const typeCode = t.complianceTypeCode ?? firmCode;
      return {
        id: t.id, title: t.title, periodLabel: t.periodLabel, effectiveDueDate: t.effectiveDueDate, status: t.status, filedDate: t.filedDate,
        kind: firmCode ? "FIRM_ONLY" : t.complianceTypeCode ? "STATUTORY" : "ONE_OFF", typeCode, typeName: typeCode ? types.get(typeCode) ?? typeCode : "",
        owner: t.assignments.map((a) => a.user.displayName).join(", "), display: displayState(t.status as TaskStatus, t.effectiveDueDate, today),
      };
    }),
  };
}

const obligationInput = z.object({
  typeCode: z.string().min(1, "Choose the obligation"),
  periodLabel: z.string().trim().min(2, "Say which period or person this is for (e.g. 2026-27, or the member's name)").max(80),
  dueDate: z.string().refine(isIsoDate, "Enter the due date from the certificate / policy / notice"),
  ownerId: z.string().nullable().optional(),
  note: z.string().trim().max(300).default(""),
});

/**
 * Record one instance of a firm-only obligation (e.g. "PI insurance renewal 2026-27, due 2027-03-31") as a task of
 * the firm client. The due date is typed from the document (MANUAL rule) — never computed. Partner / Practice Admin
 * (Due-Date Master) or whoever may bulk-manage the firm client's tasks.
 */
export async function recordFirmObligation(actor: Actor, input: z.input<typeof obligationInput>) {
  requireStaff(actor);
  const firm = await ensureFirmClient(actor);
  if (!can(actor, "dueDateMaster.manage")) await assertClientAccess(actor, "task.bulk", firm.id);
  const d = parse(obligationInput, input);
  const type = await db().complianceType.findUnique({ where: { code: d.typeCode } });
  if (!type || !type.isFirmOnly) throw notFound("Firm obligation type");
  const periodKey = `${FIRM_PREFIX}${type.code}:${d.periodLabel.toUpperCase().replace(/[^A-Z0-9-]+/g, "-")}`;
  if (await db().task.count({ where: { clientId: firm.id, periodKey } })) throw ruleViolation(`${type.name} for ${d.periodLabel} is already recorded.`);
  if (d.ownerId) {
    const u = await db().user.findUnique({ where: { id: d.ownerId } });
    if (!u || !u.active || u.isSystem || u.role === "HR_ADMIN") throw new DomainError("VALIDATION", "Choose an active owner.", { ownerId: "Check the owner" });
  }
  const version = await db().stageTemplateVersion.findFirst({ where: { template: { code: "OTHER" }, status: "ACTIVE" }, orderBy: { version: "desc" } });
  return transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        clientId: firm.id, title: `${type.name}${d.periodLabel ? ` — ${d.periodLabel}` : ""}`, periodKey, periodLabel: d.periodLabel, originalDueDate: d.dueDate, effectiveDueDate: d.dueDate,
        isOneOff: true, dueBasis: `${FIRM_PREFIX}${type.code} due date entered manually${d.note ? ` (${d.note})` : ""}`, ackType: type.ackType,
        stageTemplateVersionId: version?.id ?? null, createdById: actor.userId,
      },
    });
    await tx.taskStatusHistory.create({ data: { taskId: t.id, toStatus: "UPCOMING", reason: "Firm obligation recorded", createdById: actor.userId } });
    await tx.dueDateHistory.create({ data: { taskId: t.id, oldValue: null, newValue: d.dueDate, source: "MANUAL_ENTRY", reference: d.note || "Firm obligation", createdById: actor.userId } });
    if (d.ownerId) for (const role of ["ASSIGNEE", "MAKER"]) await tx.taskAssignment.create({ data: { taskId: t.id, userId: d.ownerId, role, fromDate: todayIst(), createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: t.id, action: "CREATE", after: { firmObligation: type.code, periodLabel: d.periodLabel, dueDate: d.dueDate, ownerId: d.ownerId ?? null } });
    return t;
  });
}
