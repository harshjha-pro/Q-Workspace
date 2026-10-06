import type { ExistingTask, TaskUpdate } from "./types";

/** Rules Spec 5.2: an extension = types + periods + scope filter + new date. */
export type ExtensionDef = {
  reference: string;
  typeCodes: string[];
  periodsMode: "SPECIFIC" | "ALL_OPEN";
  periodKeys: string[];
  /** Clauses are ANDed; values within a clause are ORed. Empty = all clients. */
  scope: { field: "constitution" | "gstFrequency" | "state" | "clientId"; values: string[] }[];
  newDate: string;
};

export type TaskForExtension = ExistingTask & { constitution: string; state: string | null; gstFrequency: string | null };

function inScope(t: TaskForExtension, scope: ExtensionDef["scope"]) {
  return scope.every((c) => {
    const v = c.field === "constitution" ? t.constitution : c.field === "gstFrequency" ? t.gstFrequency : c.field === "state" ? t.state : t.clientId;
    return v !== null && c.values.includes(v);
  });
}

/**
 * Tasks an extension applies to. "All open periods" (decisions D-40) = every task of the types that is
 * still open, plus Filed Late tasks filed on/before the new date (the only filed ones it can change).
 * Not Applicable tasks are never touched.
 */
export function matchExtension(ext: ExtensionDef, tasks: TaskForExtension[]): TaskForExtension[] {
  return tasks.filter((t) => {
    if (!ext.typeCodes.includes(t.typeCode) || t.status === "NOT_APPLICABLE") return false;
    if (ext.periodsMode === "SPECIFIC" && !ext.periodKeys.includes(t.periodKey)) return false;
    if (ext.periodsMode === "ALL_OPEN" && (t.status === "FILED" || (t.status === "FILED_LATE" && !(t.filedDate && t.filedDate <= ext.newDate)))) return false;
    return inScope(t, ext.scope);
  });
}

/** Preview counts shown before publishing (a required confirmation step, Rules Spec 5.2). */
export function previewExtension(ext: ExtensionDef, tasks: TaskForExtension[]) {
  const m = matchExtension(ext, tasks);
  return { tasks: m.length, clients: new Set(m.map((t) => t.clientId)).size, reclassify: m.filter((t) => t.status === "FILED_LATE" && t.filedDate! <= ext.newDate).length };
}

/** Rules Spec 5.3: what publishing does to each matched task. Filed is never reversed. */
export function planExtension(ext: ExtensionDef, tasks: TaskForExtension[]): TaskUpdate[] {
  return matchExtension(ext, tasks).map((t) => {
    const u: TaskUpdate = {
      taskId: t.id,
      effectiveDueDate: ext.newDate,
      history: { oldValue: t.effectiveDueDate, newValue: ext.newDate, source: "EXTENSION", reference: ext.reference },
    };
    if (t.status === "FILED_LATE" && t.filedDate && t.filedDate <= ext.newDate) {
      u.status = "FILED";
      u.statusReason = `Reclassified to Filed — extension ${ext.reference}`;
    }
    return u;
  });
}
