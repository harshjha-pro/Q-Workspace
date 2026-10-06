import { db } from "../../lib/db";
import { addDays, dayOfWeek, diffDays, formatDate, todayIst, weekStart } from "../../lib/dates";
import { remindersDue, DEFAULT_REMINDERS, type ReminderTask } from "../../compliance-engine";
import { notifyUsers } from "../notifications/service";
import { getSetting, getSettingNumber } from "../settings/service";
import { missingDays, missingBanner } from "../work/service";
import { logger } from "../../lib/logger";

const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];
const ACTIVE_ROLES = ["PARTNER", "MANAGER", "STAFF", "ARTICLE"];

/**
 * Daily reminder and escalation run (Rules Spec 9, spec 8.2; P2-34, P2-37, P2-40). Every alert carries
 * a dedupe key, so "Run now" and the catch-up run never send the same alert twice.
 */
export async function runReminders(today = todayIst()) {
  const counts: Record<string, number> = {};
  const add = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

  // 1. Task due dates, overdue escalation, pending-from-client follow-up, review SLA.
  const tasks = await db().task.findMany({
    where: { status: { in: OPEN } },
    select: {
      id: true, title: true, status: true, effectiveDueDate: true, pendingSince: true, underReviewSince: true,
      assignments: { where: { toDate: null }, select: { userId: true, role: true } },
      client: { select: { name: true, managerId: true, partnerId: true } },
      engagement: { select: { managerId: true, partnerId: true } },
    },
  });
  const input: ReminderTask[] = tasks.map((t) => ({
    id: t.id, title: `${t.title} — ${t.client.name}`, status: t.status, effectiveDueDate: t.effectiveDueDate, pendingSince: t.pendingSince,
    underReviewSince: t.underReviewSince ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(t.underReviewSince) : null,
    assigneeIds: t.assignments.filter((a) => a.role === "ASSIGNEE" || a.role === "MAKER").map((a) => a.userId),
    checkerId: t.assignments.find((a) => a.role === "CHECKER")?.userId ?? null,
    managerId: t.engagement?.managerId ?? t.client.managerId,
    partnerId: t.engagement?.partnerId ?? t.client.partnerId,
  }));
  const cfg = {
    upcomingDays: await getSetting<number[]>("reminders.upcomingDays", DEFAULT_REMINDERS.upcomingDays),
    managerEscalationDays: await getSettingNumber("reminders.managerEscalationDays", DEFAULT_REMINDERS.managerEscalationDays),
    partnerEscalationDays: await getSettingNumber("reminders.partnerEscalationDays", DEFAULT_REMINDERS.partnerEscalationDays),
    pendingFollowUpEveryDays: await getSettingNumber("reminders.pendingFollowUpEveryDays", DEFAULT_REMINDERS.pendingFollowUpEveryDays),
    pendingEscalationDays: await getSettingNumber("reminders.pendingEscalationDays", DEFAULT_REMINDERS.pendingEscalationDays),
    pendingEscalationDueWithinDays: await getSettingNumber("reminders.pendingEscalationDueWithinDays", DEFAULT_REMINDERS.pendingEscalationDueWithinDays),
    reviewSlaDays: await getSettingNumber("reminders.reviewSlaDays", DEFAULT_REMINDERS.reviewSlaDays),
  };
  for (const e of remindersDue(input, today, cfg)) {
    add(e.kind, await notifyUsers(e.userIds, { kind: e.kind, title: e.title, link: `/tasks/${e.taskId}`, entityType: "Task", entityId: e.taskId, priority: e.priority, dedupeKey: e.dedupeKey }));
  }

  // 2. Notice responses and hearings: 7 / 3 / 1 days and on the day.
  const notices = await db().notice.findMany({ where: { status: { not: "CLOSED" } }, include: { hearings: { where: { date: { gte: today } } } } });
  for (const n of notices) {
    const people = [n.assigneeId, n.reviewerId].filter((x): x is string => !!x);
    if (n.responseDueDate && ["OPEN", "HEARING"].includes(n.status)) {
      const d = diffDays(today, n.responseDueDate);
      if ([7, 3, 1, 0].includes(d) || d < 0) {
        const title = d < 0 ? `Notice response overdue by ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "Notice response due today" : `Notice response due in ${d} day${d === 1 ? "" : "s"}`;
        add("NOTICE_DUE", await notifyUsers(people, { kind: "NOTICE_DUE", title, body: n.section ? `u/s ${n.section}` : "", link: `/notices/${n.id}`, priority: d <= 1 ? "HIGH" : "NORMAL", dedupeKey: `NOTICE_DUE|${n.id}|${d < 0 ? today : d}` }));
      }
    }
    for (const h of n.hearings) {
      const d = diffDays(today, h.date);
      if ([7, 3, 1, 0].includes(d)) add("HEARING", await notifyUsers(people, { kind: "HEARING", title: d === 0 ? "Hearing today" : `Hearing in ${d} day${d === 1 ? "" : "s"} (${formatDate(h.date)})`, link: `/notices/${n.id}`, priority: d <= 1 ? "HIGH" : "NORMAL", dedupeKey: `HEARING|${h.id}|${d}` }));
    }
  }

  // 3. DSC expiry at each alert threshold and on expiry (spec 6.3).
  const thresholds = await getSetting<number[]>("dsc.expiryAlertDays", [30, 7]);
  const admins = (await db().user.findMany({ where: { active: true, role: { in: ["PRACTICE_ADMIN"] } }, select: { id: true } })).map((u) => u.id);
  const dscs = await db().dSC.findMany({ where: { active: true, expiryDate: { lte: addDays(today, Math.max(...thresholds)) } }, include: { clients: true } });
  for (const d of dscs) {
    const days = diffDays(today, d.expiryDate);
    const hit = [...thresholds, 0].find((t) => days === t);
    if (hit === undefined) continue;
    const managers = (await db().client.findMany({ where: { id: { in: d.clients.map((c) => c.clientId) } }, select: { managerId: true } })).map((c) => c.managerId);
    const to = [...admins, ...managers, d.custodianUserId].filter((x): x is string => !!x);
    add("DSC_EXPIRY", await notifyUsers(to, { kind: "DSC_EXPIRY", title: hit === 0 ? `DSC of ${d.holderName} expires today` : `DSC of ${d.holderName} expires in ${days} days`, link: "/registers/dsc", priority: hit === 0 ? "HIGH" : "NORMAL", dedupeKey: `DSC|${d.id}|${hit}` }));
  }

  // 4. UDINs not recorded within the setting (P2-30).
  const udinDays = await getSettingNumber("udin.awaitingDays", 7);
  const awaiting = await db().uDINRecord.findMany({ where: { status: "AWAITING", signingDate: { lte: addDays(today, -udinDays) } } });
  for (const u of awaiting) add("UDIN_DUE", await notifyUsers([u.partnerId], { kind: "UDIN_DUE", title: `UDIN not recorded: ${u.documentType} signed ${formatDate(u.signingDate)}`, link: "/registers/udin", priority: "HIGH", dedupeKey: `UDIN|${u.id}|${weekStart(today)}` }));

  // 5. Credentials due for a change, to the client manager once a month.
  const changeDays = await getSettingNumber("credentials.changeAfterDays", 90);
  const creds = await db().credential.findMany({ where: { active: true, changePeriodically: true, OR: [{ lastChangedOn: null }, { lastChangedOn: { lte: addDays(today, -changeDays) } }] } });
  for (const c of creds) {
    const client = await db().client.findUnique({ where: { id: c.clientId }, select: { managerId: true, name: true } });
    if (client?.managerId) add("CREDENTIAL_CHANGE", await notifyUsers([client.managerId], { kind: "CREDENTIAL_CHANGE", title: `${c.portal} password for ${client.name} is due for a change`, link: `/clients/${c.clientId}/vault`, dedupeKey: `CRED|${c.id}|${today.slice(0, 7)}` }));
  }

  // 6. Missing work entries (spec 8.2) and the weekly lock warning on the last working day.
  const people = await db().user.findMany({ where: { active: true, role: { in: ACTIVE_ROLES } }, select: { id: true } });
  const lockTime = await getSetting<string>("work.weeklyLockTime", "16:00");
  const dow = dayOfWeek(today);
  for (const p of people) {
    try {
      const missing = await missingDays(p.id, today);
      if (missing.length) add("MISSING_ENTRIES", await notifyUsers([p.id], { kind: "MISSING_ENTRIES", title: missingBanner(missing)!, link: `/work?date=${missing[0]}`, dedupeKey: `MISSING|${p.id}|${today}` }));
    } catch (err) {
      logger().warn({ err, userId: p.id }, "missing-entry check failed");
    }
  }
  if (dow === 6 || dow === 0) {
    add("WEEK_LOCK", await notifyUsers(people.map((p) => p.id), { kind: "WEEK_LOCK", title: `This week's entries lock on Sunday at ${lockTime}`, link: "/work/week", dedupeKey: `LOCK|${weekStart(today)}` }));
  }
  return counts;
}
