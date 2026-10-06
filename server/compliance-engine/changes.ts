import type { ClientSnapshot, ComplianceTypeDef, DueRuleDef, ExistingTask, Obligation, TaskUpdate } from "./types";
import { periodFromKey } from "./periods";
import { computeDueDate, pickRule } from "./rules";
import { valueAt } from "./applicability";

const AUTO_NA_STATUSES = new Set(["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT"]);
const GST_PERIODIC = new Set(["GST-R1-M", "GST-3B-M", "GST-IFF", "GST-R1-Q", "GST-3B-Q", "GST-CMP08"]);

function covers(o: Obligation, periodStart: string, periodEnd: string) {
  return o.start <= periodEnd && (!o.end || periodStart < o.end);
}

/**
 * Open tasks whose obligation no longer covers their period become Not Applicable (Rules Spec 7.2,
 * open-questions Q-05: the period start date decides, so an In-Progress task for a period starting
 * on/after the "off" date is closed too; its work entries are kept). Under Review, Filed and Filed
 * Late are never touched. GST frequency changes link the old task to the new one (Rules Spec 7.3).
 * Discontinued clients keep open tasks for manual closure (Rules Spec 7.5).
 */
export function planObligationEnds(tasks: ExistingTask[], obligations: Obligation[], opts: { suppressAutoNa: boolean }): TaskUpdate[] {
  if (opts.suppressAutoNa) return [];
  const out: TaskUpdate[] = [];
  for (const t of tasks) {
    if (!AUTO_NA_STATUSES.has(t.status) || t.periodKey.startsWith("CLOSE-")) continue;
    const period = periodFromKey(t.periodKey);
    const mine = obligations.filter((o) => o.typeCode === t.typeCode && o.partyKey === t.partyKey);
    if (mine.some((o) => covers(o, period.start, period.end))) continue;
    // The most recent window that ended before this period explains why it no longer applies.
    let ended: Obligation | undefined;
    for (const o of mine) if (o.end && o.end <= period.start && (!ended || o.end > ended.end!)) ended = o;
    if (GST_PERIODIC.has(t.typeCode)) {
      const replacement = obligations.find((o) => o.partyKey === t.partyKey && GST_PERIODIC.has(o.typeCode) && o.typeCode !== t.typeCode && !o.typeCode.startsWith("GST-IFF") && covers(o, period.start, period.end));
      if (replacement) {
        out.push({ taskId: t.id, status: "NOT_APPLICABLE", notApplicableReason: "Superseded by GST frequency change", supersededByKey: { typeCode: replacement.typeCode, partyKey: t.partyKey, periodKey: "" }, statusReason: "Superseded by GST frequency change" });
        continue;
      }
    }
    const reason = ended?.endReason ?? "No longer applicable";
    out.push({ taskId: t.id, status: "NOT_APPLICABLE", notApplicableReason: reason, statusReason: reason });
  }
  return out;
}

/**
 * Recompute event-linked due dates (AOC-4, MGT-7, ADT-1) after an event date is entered or corrected
 * (Rules Spec 4.2–4.3). The filed record is never altered; Filed Late may become Filed, never the reverse.
 */
export function planEventRecompute(
  client: ClientSnapshot,
  tasks: ExistingTask[],
  types: Map<string, ComplianceTypeDef>,
  rules: Map<string, DueRuleDef[]>,
  ceiling: { agmCeilingMonths: number; firstAgmCeilingMonths: number },
): TaskUpdate[] {
  const out: TaskUpdate[] = [];
  for (const t of tasks) {
    if (t.status === "NOT_APPLICABLE" || !types.has(t.typeCode)) continue;
    const period = periodFromKey(t.periodKey);
    const def = pickRule(rules.get(t.typeCode) ?? [], period);
    if (def?.params.kind !== "EVENT_OFFSET") continue;
    const flagsOn = new Set(Object.keys(client.flags).filter((f) => valueAt(client.flags[f], period.end)));
    const due = computeDueDate(def.params, period, { flagsOn, events: client.events, incorporationDate: client.incorporationDate, ...ceiling });
    if (!due.date || (due.date === t.effectiveDueDate && due.isProvisional === t.isProvisional)) continue;
    const u: TaskUpdate = {
      taskId: t.id,
      originalDueDate: due.date,
      effectiveDueDate: due.date,
      isProvisional: due.isProvisional,
      history: { oldValue: t.effectiveDueDate, newValue: due.date, source: "EVENT_CORRECTION", reference: due.basis },
    };
    if (t.status === "FILED_LATE" && t.filedDate && t.filedDate <= due.date) {
      u.status = "FILED";
      u.statusReason = "Reclassified to Filed after the event date was corrected";
    }
    out.push(u);
  }
  return out;
}
