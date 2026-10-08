/**
 * Phase 4 reference data. Client-document reminder schedules are the firm's own working habit, not statutory
 * values: two general placeholders (any compliance type) that the firm edits under Reminders → Schedules.
 */
import type { PrismaClient } from "../../../generated/prisma/client";

export const REMINDER_SCHEDULES = [
  { name: "Pending documents — early month (placeholder)", dayOfMonth: 3, escalateAfter: 3 },
  { name: "Pending documents — mid month (placeholder)", dayOfMonth: 12, escalateAfter: 3 },
];

/** Idempotent: matched by name, never overwritten once the firm edits a schedule. */
export async function seedPortalReference(db: PrismaClient) {
  for (const s of REMINDER_SCHEDULES) {
    if (!(await db.clientReminderSchedule.findFirst({ where: { name: s.name } }))) {
      await db.clientReminderSchedule.create({ data: { ...s, complianceTypeCode: null, monthsCsv: "", messageText: "", createdById: "system" } });
    }
  }
}

/** Demo portal password: the same as staff, so one line in the README covers both. */
const DEMO_PASSWORD = "Qepex@2026";

/**
 * Demo client portal (4.8): 15 portal users and some activity, all created through the portal services so the
 * demo exercises the real rules (invites, uploads, confirmations, messages, approvals, reminder lists).
 * - Group users: the Kulkarni group CFO and Kiran Shah each see their group's entities.
 * - Single-entity users for 13 more clients; the last one's invite is left open (not yet accepted).
 * Idempotent: skipped when portal users already exist.
 */
export async function seedPortalDemo() {
  const { db } = await import("../../../server/lib/db");
  const { systemActor } = await import("../../../server/permissions/actor");
  const accounts = await import("../../../server/services/portal/accounts");
  const portalActions = await import("../../../server/services/portal/actions");
  const messages = await import("../../../server/services/messages/service");
  const { updateChecklistItem } = await import("../../../server/services/pending/service");
  const { fileGeneratedDocument } = await import("../../../server/services/dms/service");
  const { runReminderDueLists } = await import("../../../server/services/reminders/due-lists");
  const { resolveSession } = await import("../../../server/services/auth/sessions");
  const { portalLogin } = await import("../../../server/services/auth/login");
  type PortalActor = import("../../../server/permissions/actor").PortalActor;
  type StaffActor = import("../../../server/permissions/actor").StaffActor;

  if ((await db().portalUser.count()) > 0) return;
  await seedPortalReference(db());
  const admin = systemActor();
  const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "").slice(0, 24);
  const clients = await db().client.findMany({ where: { isFirm: false, status: "ACTIVE" }, include: { contacts: { where: { isPrimary: true }, take: 1 }, group: true }, orderBy: { name: "asc" } });
  const byGroup = (name: string) => clients.filter((c) => c.group?.name === name);

  type Spec = { name: string; email: string; clientIds: string[]; accept: boolean };
  const specs: Spec[] = [];
  const used = new Set<string>();
  const add = (s: Spec) => {
    specs.push(s);
    s.clientIds.forEach((id) => used.add(id));
  };
  const kulkarni = byGroup("Kulkarni Family Group");
  if (kulkarni.length) add({ name: "Prakash Kulkarni (Group CFO)", email: "cfo@kulkarnigroup.example.com", clientIds: kulkarni.map((c) => c.id), accept: true });
  const shah = byGroup("Shah Industries Group");
  if (shah.length) add({ name: "Kiran Shah", email: "kiran@shahindustries.example.com", clientIds: shah.map((c) => c.id), accept: true });
  const sharma = clients.find((c) => c.name.startsWith("Sharma Textiles"));
  if (sharma) add({ name: sharma.contacts[0]?.name ?? "Accounts team", email: "accounts@sharmatextiles.example.com", clientIds: [sharma.id], accept: true });
  for (const c of clients) {
    if (specs.length >= 15) break;
    if (used.has(c.id)) continue;
    add({ name: c.contacts[0]?.name ?? c.name, email: `accounts@${slug(c.name)}.example.com`, clientIds: [c.id], accept: true });
  }
  specs[specs.length - 1]!.accept = false; // one invite still open, to show that state in Admin → Portal users

  const ids: Record<string, string> = {};
  for (const s of specs) {
    let token = "";
    for (const clientId of s.clientIds) {
      const r = await accounts.invitePortalUser(admin, { clientId, name: s.name, email: s.email });
      token = r.token;
      ids[s.email] = r.portalUserId;
    }
    if (s.accept) await accounts.acceptPortalInvite(token, DEMO_PASSWORD, DEMO_PASSWORD);
  }

  // Activity, as the users themselves.
  const actorFor = async (email: string): Promise<PortalActor> => {
    const r = await portalLogin({ email, password: DEMO_PASSWORD }, { ip: "192.168.1.50" });
    if (r.status !== "OK") throw new Error(`demo portal login failed for ${email}`);
    const s = await resolveSession(r.sessionId);
    return s!.actor as PortalActor;
  };
  const staff = async (userId: string | null): Promise<StaffActor | null> => {
    const u = userId ? await db().user.findUnique({ where: { id: userId } }) : null;
    return u ? { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName } : null;
  };
  const csv = (rows: string) => Buffer.from(`date,narration,amount\n${rows}\n`);

  for (const email of ["cfo@kulkarnigroup.example.com", "accounts@sharmatextiles.example.com", "kiran@shahindustries.example.com"]) {
    if (!ids[email]) continue;
    const me = await actorFor(email);
    // Uploads: the first open request is answered (awaiting confirmation); with three or more, the second is
    // answered and confirmed by the assignee; the last is answered from "Send something else", so keyword
    // tagging has to suggest the match.
    const requested = await db().checklistItem.findMany({ where: { clientId: { in: me.clientIds }, status: "REQUESTED", taskId: { not: null } }, orderBy: { requestedAt: "asc" }, take: 3 });
    const [first] = requested;
    const confirmed = requested.length >= 3 ? requested[1] : undefined;
    const free = requested.length >= 2 ? requested[requested.length - 1] : undefined;
    if (first) await portalActions.portalUpload(me, { clientId: first.clientId, checklistItemId: first.id }, { name: `${slug(first.label)}-sep-2026.csv`, data: csv("2026-09-01,Opening,0") });
    if (confirmed) {
      await portalActions.portalUpload(me, { clientId: confirmed.clientId, checklistItemId: confirmed.id }, { name: `${slug(confirmed.label)}.csv`, data: csv("2026-09-02,Entry,100") });
      const task = await db().task.findUnique({ where: { id: confirmed.taskId! }, include: { assignments: { where: { toDate: null } } } });
      const confirmer = await staff(task?.assignments[0]?.userId ?? null);
      if (confirmer) await updateChecklistItem(confirmer, confirmed.id, { confirm: true });
    }
    if (free) await portalActions.portalUpload(me, { clientId: free.clientId, description: "As discussed on the phone" }, { name: `${free.label} - Sep 2026.csv`, data: csv("2026-09-03,Entry,250") });

    // 3. Conversations: one answered by the firm, one still waiting.
    const client = await db().client.findUniqueOrThrow({ where: { id: me.clientIds[0]! } });
    const t1 = await messages.startThread(me, { clientId: client.id, subject: "TDS on the new office rent", body: "We have started renting a new office from October. Should we deduct TDS on the rent?" });
    const replier = await staff(client.managerId ?? client.partnerId);
    if (replier) await messages.postMessage(replier, t1.id, { body: "Yes, if the annual rent crosses the threshold. Please share the rent agreement and we will confirm the rate and the first deduction month." });
    await messages.startThread(me, { clientId: client.id, subject: "Advance tax for December", body: "Could you share the estimated advance tax for the December instalment?" });

    // 4. Approvals: one waiting, one already approved.
    const task = await db().task.findFirst({ where: { clientId: { in: me.clientIds }, status: { in: ["IN_PROGRESS", "UNDER_REVIEW"] } }, include: { assignments: { where: { toDate: null } } }, orderBy: { effectiveDueDate: "asc" } });
    const asker = await staff(task?.assignments[0]?.userId ?? client.managerId);
    if (task && asker) {
      const doc = await fileGeneratedDocument({ clientId: task.clientId, engagementId: task.engagementId, taskId: task.id, name: `${task.title} - draft for approval.pdf`, buffer: Buffer.from("%PDF-1.4\n% demo draft for client approval\n"), actor: asker });
      await portalActions.requestClientApproval(asker, task.id, { title: `Approve the draft: ${task.title}`, note: "Please check the figures before we file.", documentId: doc.id });
      const second = await portalActions.requestClientApproval(asker, task.id, { title: `Confirm turnover figure for ${task.periodLabel || "the period"}`, note: "" });
      await portalActions.decideClientApproval(me, second.id, { decision: "APPROVED", comment: "Confirmed." }, { ip: "192.168.1.50" });
    }
  }

  // 5. Reminder-due lists. The demo's requests were all made in the last few days, after this month's schedule
  // day, so a week of history is given to those still open for the portal clients, and the list is built as on
  // the latest schedule day (then today, for payments). Demo data only; the job's rules are unchanged.
  const { addDays, todayIst } = await import("../../../server/lib/dates");
  const today = todayIst();
  const days = (await db().clientReminderSchedule.findMany({ where: { active: true }, select: { dayOfMonth: true } })).map((x) => x.dayOfMonth).filter((d) => d <= Number(today.slice(8))).sort((a, b) => b - a);
  if (days.length) {
    const asOf = `${today.slice(0, 8)}${String(days[0]).padStart(2, "0")}`;
    const portalClientIds = [...used];
    await db().checklistItem.updateMany({ where: { clientId: { in: portalClientIds }, status: "REQUESTED" }, data: { requestedAt: addDays(asOf, -7) } });
    await runReminderDueLists(asOf);
  }
  await runReminderDueLists(today);
}
