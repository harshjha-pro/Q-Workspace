import { db, transaction } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { forbidden, notFound, ruleViolation } from "../../lib/errors";
import { writeAudit } from "../../audit";
import { buildTemplate, readSheets, type ParsedRow } from "../../excel/workbook";
import { IMPORT_DEFS, type ImportKind, type CheckedRow, type ApplyResult } from "./definitions";

function defFor(actor: Actor, kind: ImportKind) {
  authorize(actor, "import.run");
  const def = IMPORT_DEFS[kind];
  if (!def) throw notFound("Import type");
  if (actor.kind !== "SYSTEM" && !def.roles.includes(actor.role)) throw forbidden(`Your role cannot import ${def.title.toLowerCase()}.`);
  return def;
}

/** Import types this actor may run (HR: people/payroll; Practice Admin: clients/users/billing/CRM; Partner: all). */
export function importKindsFor(actor: Actor) {
  return Object.values(IMPORT_DEFS)
    .filter((d) => actor.kind === "SYSTEM" || d.roles.includes(actor.role))
    .map((d) => ({ kind: d.kind, title: d.title }));
}

export async function importTemplate(actor: Actor, kind: ImportKind) {
  const def = defFor(actor, kind);
  return { fileName: `qepex-import-${kind.toLowerCase()}.xlsx`, data: await buildTemplate(def.sheets, def.instructions) };
}

/** Step 1: upload → validate every row → store the job with a row-by-row report. Nothing is applied. */
export async function validateImport(actor: Actor, kind: ImportKind, fileName: string, data: Buffer) {
  const def = defFor(actor, kind);
  let sheets: Record<string, ParsedRow[]>;
  try {
    sheets = await readSheets(data, def.sheets);
  } catch {
    throw ruleViolation("Could not read the file. Use the .xlsx template.");
  }
  const checked = await def.validate(sheets);
  if (checked.length === 0) throw ruleViolation("The file has no data rows.");
  const errorRows = checked.filter((r) => r.errors.length > 0).length;
  const job = await transaction(async (tx) => {
    const j = await tx.importJob.create({
      data: {
        kind, fileName, status: errorRows ? "FAILED" : "VALIDATED", totalRows: checked.length, validRows: checked.length - errorRows, errorRows,
        summaryJson: JSON.stringify({ preview: def.preview?.(checked) ?? [] }), createdById: idOf(actor),
        rows: {
          create: checked.map((r) => ({
            rowNumber: r.rowNumber, dataJson: JSON.stringify({ sheet: r.sheet, data: r.data }), errorsJson: JSON.stringify(r.errors),
            status: r.errors.length ? "INVALID" : "VALID",
          })),
        },
      },
    });
    await writeAudit(tx, actor, { entityType: "ImportJob", entityId: j.id, action: "VALIDATE", after: { kind, fileName, rows: checked.length, errorRows } });
    return j;
  });
  return getImportJob(actor, job.id);
}

export async function getImportJob(actor: Actor, jobId: string) {
  authorize(actor, "import.run");
  const job = await db().importJob.findUnique({ where: { id: jobId }, include: { rows: { orderBy: [{ rowNumber: "asc" }] } } });
  if (!job) throw notFound("Import");
  defFor(actor, job.kind as ImportKind);
  const summary = JSON.parse(job.summaryJson) as { preview?: string[]; result?: ApplyResult };
  return {
    ...job,
    preview: summary.preview ?? [],
    result: summary.result ?? null,
    rows: job.rows.map((r) => {
      const { sheet, data } = JSON.parse(r.dataJson) as { sheet: string; data: Record<string, string> };
      return { id: r.id, sheet, rowNumber: r.rowNumber, data, errors: JSON.parse(r.errorsJson) as string[], status: r.status };
    }),
  };
}

export async function listImportJobs(actor: Actor) {
  authorize(actor, "import.run");
  const kinds = importKindsFor(actor).map((k) => k.kind);
  return db().importJob.findMany({ where: { kind: { in: kinds } }, orderBy: { createdAt: "desc" }, take: 50 });
}

/**
 * Step 2: apply a clean job. Rows are validated again first (the data may have changed since
 * the upload), then created through the normal services so every rule and audit entry applies.
 */
export async function applyImport(actor: Actor, jobId: string) {
  const job = await getImportJob(actor, jobId);
  const def = defFor(actor, job.kind as ImportKind);
  if (job.status !== "VALIDATED") throw ruleViolation(job.status === "APPLIED" ? "This import was already applied." : "Fix the errors and upload again.");
  const sheets: Record<string, ParsedRow[]> = {};
  for (const r of job.rows) (sheets[r.sheet] ??= []).push({ rowNumber: r.rowNumber, data: r.data });
  const recheck: CheckedRow[] = await def.validate(sheets);
  if (recheck.some((r) => r.errors.length)) {
    throw ruleViolation("Some rows are no longer valid (the data changed since upload). Upload the file again.");
  }
  const result = await def.apply(actor, recheck);
  await transaction(async (tx) => {
    await tx.importJob.update({
      where: { id: jobId },
      data: { status: "APPLIED", appliedAt: new Date(), summaryJson: JSON.stringify({ preview: job.preview, result: { ...result, tempPasswords: undefined } }) },
    });
    await tx.importRow.updateMany({ where: { jobId }, data: { status: "APPLIED" } });
    await writeAudit(tx, actor, { entityType: "ImportJob", entityId: jobId, action: "IMPORT", after: { kind: job.kind, created: result.created } });
  });
  // Temporary passwords are returned once and never stored.
  return result;
}

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
