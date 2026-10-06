import { diffDays } from "../lib/dates";

export type ReminderTask = {
  id: string;
  title: string;
  status: string;
  effectiveDueDate: string | null;
  pendingSince: string | null;
  underReviewSince: string | null;
  assigneeIds: string[];
  checkerId: string | null;
  managerId: string | null;
  partnerId: string | null;
};

export type ReminderConfig = {
  upcomingDays: number[]; // [7, 3, 1]
  managerEscalationDays: number; // 1
  partnerEscalationDays: number; // 3
  pendingFollowUpEveryDays: number; // 3
  pendingEscalationDays: number; // 10
  pendingEscalationDueWithinDays: number; // 5
  reviewSlaDays: number; // 2
};

export const DEFAULT_REMINDERS: ReminderConfig = {
  upcomingDays: [7, 3, 1], managerEscalationDays: 1, partnerEscalationDays: 3,
  pendingFollowUpEveryDays: 3, pendingEscalationDays: 10, pendingEscalationDueWithinDays: 5, reviewSlaDays: 2,
};

export type ReminderEvent = { kind: string; taskId: string; userIds: string[]; title: string; priority: "NORMAL" | "HIGH" | "ESCALATION"; dedupeKey: string };

const OPEN = new Set(["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"]);

/**
 * Rules Spec 9: reminder and escalation events due today. Each carries a dedupe key, so the daily
 * job can run any number of times without sending the same alert twice.
 */
export function remindersDue(tasks: ReminderTask[], today: string, cfg: ReminderConfig = DEFAULT_REMINDERS): ReminderEvent[] {
  const out: ReminderEvent[] = [];
  const push = (t: ReminderTask, kind: string, userIds: (string | null)[], title: string, priority: ReminderEvent["priority"], suffix: string) => {
    const ids = [...new Set(userIds.filter((u): u is string => Boolean(u)))];
    if (ids.length) out.push({ kind, taskId: t.id, userIds: ids, title, priority, dedupeKey: `${kind}|${t.id}|${suffix}` });
  };
  for (const t of tasks) {
    if (!OPEN.has(t.status)) continue;
    if (t.effectiveDueDate) {
      const days = diffDays(today, t.effectiveDueDate);
      if (cfg.upcomingDays.includes(days)) push(t, "DUE_SOON", t.assigneeIds, `${t.title} is due in ${days} day${days === 1 ? "" : "s"}`, "NORMAL", `T-${days}|${t.effectiveDueDate}`);
      if (days === 0) push(t, "DUE_TODAY", t.assigneeIds, `${t.title} is due today`, "HIGH", t.effectiveDueDate);
      if (days < 0) {
        const late = -days;
        push(t, "OVERDUE", t.assigneeIds, `${t.title} is ${late} day${late === 1 ? "" : "s"} overdue`, "HIGH", today);
        if (late >= cfg.managerEscalationDays) push(t, "ESCALATE_MANAGER", [t.managerId], `Overdue: ${t.title}`, "ESCALATION", t.effectiveDueDate);
        if (late >= cfg.partnerEscalationDays) push(t, "ESCALATE_PARTNER", [t.partnerId], `Still overdue: ${t.title}`, "ESCALATION", t.effectiveDueDate);
      }
    }
    if (t.status === "PENDING_FROM_CLIENT" && t.pendingSince) {
      const pending = diffDays(t.pendingSince, today);
      if (pending > 0 && pending % cfg.pendingFollowUpEveryDays === 0) push(t, "PENDING_FOLLOW_UP", t.assigneeIds, `Follow up with the client: ${t.title} (pending ${pending} days)`, "NORMAL", today);
      const dueSoon = t.effectiveDueDate !== null && diffDays(today, t.effectiveDueDate) <= cfg.pendingEscalationDueWithinDays;
      if (pending >= cfg.pendingEscalationDays && dueSoon) push(t, "PENDING_ESCALATION", [t.managerId], `Client documents pending ${pending} days, due soon: ${t.title}`, "ESCALATION", t.pendingSince);
    }
    if (t.status === "UNDER_REVIEW" && t.underReviewSince) {
      const waiting = diffDays(t.underReviewSince, today);
      if (waiting >= cfg.reviewSlaDays) push(t, "REVIEW_SLA", [t.checkerId], `Waiting for your review: ${t.title}`, "NORMAL", today);
      if (waiting >= cfg.reviewSlaDays * 2) push(t, "REVIEW_SLA_ESCALATION", [t.partnerId], `Review pending ${waiting} days: ${t.title}`, "ESCALATION", t.underReviewSince);
    }
  }
  return out;
}
