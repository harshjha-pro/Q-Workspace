/**
 * Demo activity (Phase 2): compliance tasks for every client, about six months of work entries,
 * filed / late / pending / under-review work, notices, DSCs, UDINs, credentials, inward-outward,
 * leave and a correction request. Dates are relative to today so the demo always looks current.
 * Uses the services where a real person would act, so the same rules and audit trail apply.
 */
import { db } from "../../server/lib/db";
import type { Prisma } from "../../generated/prisma/client";
import { addDays, dayOfWeek, diffDays, todayIst, weekStart } from "../../server/lib/dates";
import type { StaffActor } from "../../server/permissions/actor";
import { syncAllClients } from "../../server/services/compliance/sync";
import { workingDays } from "../../server/services/leave/service";
import { setPending, logReminder, pendingMessage } from "../../server/services/pending/service";
import { submitForReview, returnReview } from "../../server/services/review/service";
import { createNotice, addHearing, updateNotice } from "../../server/services/registers/notices";
import { createDsc, recordMovement } from "../../server/services/registers/dsc";
import { addCredential, grantAccess } from "../../server/services/registers/vault";
import { requestCorrection } from "../../server/services/work/service";
import { runReminders } from "../../server/services/reminders/service";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(424242);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
const alnum = (n: number) => Array.from({ length: n }, () => pick("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789".split(""))).join("");

type U = { id: string; username: string; role: string; isSenior: boolean; displayName: string; defaultLocation: string; locationChangeable: boolean };
const actorOf = (u: U): StaffActor => ({ kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName });
const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];
const ACK: Record<string, string> = { GST_RETURN: "ARN", INCOME_TAX_RETURN: "ITR_ACK", TDS_RETURN: "TOKEN", ROC_ANNUAL: "SRN", PAYROLL_STATUTORY: "CHALLAN" };

const DESCRIPTIONS: Record<string, string[]> = {
  GST: ["GSTR-1 data compiled from sales register", "2B vs books ITC reconciliation", "GSTR-3B computation and challan", "Vendor-wise ITC mismatch follow-up", "E-invoice data checked against books"],
  DIRECT_TAX: ["Computation of total income", "26AS / AIS reconciliation", "TDS challan matching", "Form 16A downloaded and checked", "Advance tax estimate", "Capital gains working"],
  AUDIT: ["Vouching of purchases", "Fixed asset register verification", "Bank reconciliation review", "Debtors confirmation follow-up", "Draft notes to accounts", "Tax audit clause 44 working"],
  COMPANY_LAW: ["Board minutes drafted", "AOC-4 attachments prepared", "MGT-7A data compiled", "Statutory registers updated", "DIR-3 KYC details collected"],
  ACCOUNTING: ["Purchase and expense entries", "Bank entries and reconciliation", "Payroll entries and PF working", "Month-end MIS", "Ledger scrutiny"],
  ADVISORY: ["Projections prepared", "Valuation working", "Client meeting — requirements", "Draft report"],
};

async function users(): Promise<Map<string, U>> {
  const rows = await db().user.findMany({ where: { isSystem: false }, select: { id: true, username: true, role: true, isSenior: true, displayName: true, defaultLocation: true, locationChangeable: true } });
  return new Map(rows.map((u) => [u.username, u]));
}

export async function seedActivity() {
  const today = todayIst();
  const people = await users();
  const byId = new Map([...people.values()].map((u) => [u.id, u]));
  const P = (username: string) => people.get(username)!;

  // 1. Compliance calendar for every client (the same job that runs nightly).
  await syncAllClients();

  // 2. Leave first, so work entries skip leave days.
  const leaveDaysOf = new Map<string, Set<string>>();
  const approve = async (username: string, from: string, to: string, type: string, approver: string) => {
    const days = await workingDays(from, to);
    if (!days.length) return;
    await db().leaveRequest.create({ data: { userId: P(username).id, leaveType: type, reason: type === "SICK" ? "SICK" : "PERSONAL", fromDate: from, toDate: to, halfDays: days.length * 2, status: "APPROVED", approverId: P(approver).id, decidedAt: new Date(), createdById: P(username).id } });
    const set = leaveDaysOf.get(P(username).id) ?? new Set<string>();
    days.forEach((d) => set.add(d));
    leaveDaysOf.set(P(username).id, set);
  };
  await approve("neha.gupta", addDays(today, -40), addDays(today, -38), "PERSONAL", "rohan.iyer");
  await approve("pooja.joshi", addDays(today, -75), addDays(today, -74), "SICK", "sneha.kulkarni");
  await approve("faizan.ali", addDays(today, -20), addDays(today, -16), "EXAM_STUDY", "imran.shaikh");
  await approve("rahul.verma", addDays(today, -95), addDays(today, -91), "PERSONAL", "imran.shaikh");
  await approve("divya.krishnan", addDays(today, 3), addDays(today, 3), "PERSONAL", "sneha.kulkarni");
  // Pending requests for the approval screens; Priya's overlaps tasks she is maker on (conflict check demo).
  const priyaDue = (await db().task.findFirst({ where: { effectiveDueDate: { gte: addDays(today, 4) }, status: { notIn: CLOSED }, assignments: { some: { userId: P("priya.nair").id, toDate: null } } }, orderBy: { effectiveDueDate: "asc" } }))?.effectiveDueDate ?? addDays(today, 7);
  for (const [u, from, to, approver, note] of [["priya.nair", addDays(priyaDue, -1), addDays(priyaDue, 1), "rohan.iyer", "Family function in Kochi"], ["aditya.kumar", addDays(today, 15), addDays(today, 16), "rohan.iyer", "CA Intermediate exam"]] as const) {
    const days = await workingDays(from, to);
    await db().leaveRequest.create({ data: { userId: P(u).id, leaveType: u === "aditya.kumar" ? "EXAM_STUDY" : "PERSONAL", reason: u === "aditya.kumar" ? "EXAM_STUDY" : "PERSONAL", note, fromDate: from, toDate: to, halfDays: days.length * 2, approverId: P(approver).id, createdById: P(u).id } });
  }
  await db().leaveRequest.create({ data: { userId: P("karthik.reddy").id, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: addDays(today, -30), toDate: addDays(today, -30), halfDays: 2, status: "REJECTED", approverId: P("rohan.iyer").id, decidedAt: new Date(), decisionNote: "GSTR-3B week — please pick another day", createdById: P("karthik.reddy").id } });

  // 3. Historical filings: most past-due work filed on time, some late, a few still open (overdue).
  const tasks = await db().task.findMany({
    where: { status: { notIn: CLOSED } },
    include: { assignments: { where: { toDate: null } }, engagement: { select: { engagementType: true } }, stageTemplateVersion: { include: { stages: { orderBy: { index: "asc" } } } } },
  });
  const filedRows: { id: string; status: string }[] = [];
  for (const t of tasks) {
    if (!t.effectiveDueDate || t.effectiveDueDate >= today) continue;
    const r = rand();
    const overdueOpen = r > 0.95 && diffDays(t.effectiveDueDate, today) < 45;
    if (overdueOpen) continue;
    const late = r > 0.86;
    const filedDate = late ? addDays(t.effectiveDueDate, int(1, 12)) : addDays(t.effectiveDueDate, -int(0, 6));
    if (filedDate > today) continue;
    const stages = t.stageTemplateVersion?.stages ?? [];
    const filing = stages.find((s) => s.isFiling)?.index ?? Math.max(0, stages.length - 1);
    const maker = t.assignments.find((a) => a.role === "MAKER" || a.role === "ASSIGNEE")?.userId ?? null;
    const ackType = ACK[t.engagement?.engagementType ?? ""] ?? "ACK";
    const status = late ? "FILED_LATE" : "FILED";
    await db().task.update({
      where: { id: t.id },
      data: { status, stageIndex: filing, filedDate, filedById: maker, ackType, ackNumber: `${ackType === "ARN" ? "AA" : ackType === "SRN" ? "AB" : ""}${digits(13)}`, closedAt: new Date(`${filedDate}T18:00:00+05:30`), signoffRecorded: stages.some((s) => s.requiresUdin) },
    });
    await db().taskStatusHistory.create({ data: { taskId: t.id, fromStatus: t.status, toStatus: status, reason: "Filed (demo history)", createdById: maker } });
    filedRows.push({ id: t.id, status });
  }

  // 4. Work entries for about six months (Mon–Sat, holidays and leave skipped).
  const start = addDays(today, -182) > "2026-04-01" ? addDays(today, -182) : "2026-04-01";
  const days = (await workingDays(start, today)).filter((d) => d <= today);
  const categories = await db().internalCategory.findMany({ where: { active: true } });
  const assignments = await db().engagementAssignment.findMany({ where: { toDate: null }, include: { engagement: { select: { id: true, clientId: true, serviceLine: true, chargeable: true, status: true, stageTemplateVersionId: true } } } });
  const engagementsOf = new Map<string, typeof assignments>();
  for (const a of assignments) if (a.engagement.status === "ACTIVE") engagementsOf.set(a.userId, [...(engagementsOf.get(a.userId) ?? []), a]);
  const openTasks = await db().task.findMany({ where: { engagementId: { not: null } }, select: { id: true, engagementId: true, periodStart: true, effectiveDueDate: true, filedDate: true, stageIndex: true, stageTemplateVersion: { select: { stages: { select: { index: true, name: true }, orderBy: { index: "asc" } } } } } });
  const tasksOf = new Map<string, typeof openTasks>();
  for (const t of openTasks) tasksOf.set(t.engagementId!, [...(tasksOf.get(t.engagementId!) ?? []), t]);
  const workers = [...people.values()].filter((u) => ["PARTNER", "MANAGER", "STAFF", "ARTICLE"].includes(u.role));
  // Two people forgot the last two working days → the missing-entry banner and manager list have something to show.
  const forgetful = new Set([P("meera.pillai").id, P("siddharth.menon").id]);
  const lastTwo = new Set(days.filter((d) => d < today).slice(-2));
  const entries: Prisma.WorkEntryCreateManyInput[] = [];
  for (const u of workers) {
    const mine = engagementsOf.get(u.id) ?? [];
    for (const date of days) {
      if (leaveDaysOf.get(u.id)?.has(date)) continue;
      if (forgetful.has(u.id) && lastTwo.has(date)) continue;
      if (date === today && rand() < 0.6) continue; // the day is not over yet
      if (rand() < 0.02) continue; // the odd day off sick without leave recorded
      const target = u.role === "PARTNER" ? int(20, 32) * 15 : int(26, 38) * 15;
      let left = date === today ? Math.min(target, int(8, 16) * 15) : target;
      while (left > 0) {
        const minutes = Math.min(left, int(2, 14) * 15);
        left -= minutes;
        const internal = mine.length === 0 || rand() < (u.role === "PARTNER" ? 0.35 : 0.12);
        if (internal) {
          const c = pick(categories);
          entries.push({ userId: u.id, date, internalCategoryId: c.id, minutes, description: c.name, chargeable: c.chargeable, location: u.defaultLocation, source: "WEB", createdById: u.id, locked: date < weekStart(today) });
          continue;
        }
        const a = pick(mine);
        const e = a.engagement;
        const candidates = (tasksOf.get(e.id) ?? []).filter((t) => (!t.periodStart || t.periodStart <= date) && (!t.effectiveDueDate || addDays(t.effectiveDueDate, 15) >= date) && (!t.filedDate || t.filedDate >= date));
        const task = candidates.length && rand() < 0.75 ? pick(candidates) : null;
        const stages = task?.stageTemplateVersion?.stages ?? [];
        const stage = stages.length ? stages[Math.min(stages.length - 1, int(0, Math.max(0, stages.length - 2)))]! : null;
        const site = e.serviceLine === "AUDIT" && u.locationChangeable && rand() < 0.4;
        entries.push({
          userId: u.id, date, clientId: e.clientId, engagementId: e.id, taskId: task?.id ?? null, stageIndex: stage?.index ?? null, stageName: stage?.name ?? null, minutes,
          description: pick(DESCRIPTIONS[e.serviceLine] ?? DESCRIPTIONS.ADVISORY!), chargeable: e.chargeable, location: site ? "CLIENT_SITE" : u.defaultLocation, clientSiteClientId: site ? e.clientId : null,
          source: rand() < 0.05 ? "OFFLINE" : "WEB", createdById: u.id, locked: date < weekStart(today),
        });
      }
    }
  }
  for (let i = 0; i < entries.length; i += 1000) await db().workEntry.createMany({ data: entries.slice(i, i + 1000) });
  for (const u of workers) {
    const seen = new Map<string, { clientId: string; engagementId: string; taskId: string; n: number }>();
    for (const e of entries.filter((x) => x.userId === u.id && x.clientId).slice(-60)) {
      const key = `${e.clientId}|${e.engagementId}|${e.taskId ?? "-"}`;
      seen.set(key, { clientId: e.clientId!, engagementId: e.engagementId!, taskId: e.taskId ?? "-", n: (seen.get(key)?.n ?? 0) + 1 });
    }
    for (const r of [...seen.values()].slice(-8)) await db().recentPair.create({ data: { userId: u.id, clientId: r.clientId, engagementId: r.engagementId, taskId: r.taskId, useCount: r.n } });
  }

  // Open tasks with work logged are in progress.
  const worked = await db().workEntry.groupBy({ by: ["taskId"], where: { taskId: { not: null } } });
  const workedIds = worked.map((w) => w.taskId!).filter(Boolean);
  const toProgress = await db().task.findMany({ where: { id: { in: workedIds }, status: "UPCOMING" }, select: { id: true, stageTemplateVersion: { select: { stages: true } } } });
  for (const t of toProgress) {
    await db().task.update({ where: { id: t.id }, data: { status: "IN_PROGRESS", stageIndex: Math.min(2, Math.max(0, (t.stageTemplateVersion?.stages.length ?? 1) - 3)) } });
    await db().taskStatusHistory.create({ data: { taskId: t.id, fromStatus: "UPCOMING", toStatus: "IN_PROGRESS", reason: "Work logged", createdById: "system" } });
  }

  // Open tasks nobody picked up go to the client's Manager, except a few left for "Allocations pending".
  const unassigned = await db().task.findMany({ where: { status: { notIn: CLOSED }, assignments: { none: { toDate: null } } }, include: { client: { select: { managerId: true, partnerId: true } } }, orderBy: { effectiveDueDate: "asc" } });
  for (const t of unassigned.slice(4)) {
    const owner = t.client.managerId ?? t.client.partnerId ?? P("rohan.iyer").id;
    await db().taskAssignment.create({ data: { taskId: t.id, userId: owner, role: "ASSIGNEE", fromDate: start, createdById: "system" } });
  }

  // 5. Pending from client: waiting on documents, with a reminder sent.
  const soon = await db().task.findMany({
    where: { status: { in: ["UPCOMING", "IN_PROGRESS"] }, effectiveDueDate: { gte: today, lte: addDays(today, 30) }, engagementId: { not: null } },
    include: { assignments: { where: { toDate: null } }, stageTemplateVersion: { include: { stages: true } } },
    orderBy: { effectiveDueDate: "asc" },
  });
  const makerOf = (t: (typeof soon)[number]) => byId.get(t.assignments.find((a) => a.role === "MAKER" || a.role === "ASSIGNEE")?.userId ?? "");
  let pending = 0;
  for (const t of soon.filter((_, i) => i % 5 === 0)) {
    const maker = makerOf(t);
    if (!maker || pending >= 14) continue;
    try {
      await setPending(actorOf(maker), t.id, { what: pick(["Sales and purchase registers", "Bank statements for the quarter", "Form 16 and investment proofs", "Signed financial statements", "Board resolution and AGM notice", "Payroll data for the month"]), itemIds: (await db().checklistItem.findMany({ where: { taskId: t.id }, orderBy: { sortOrder: "asc" }, take: 2 })).map((i) => i.id) });
      const since = addDays(today, -int(2, 14));
      await db().task.update({ where: { id: t.id }, data: { pendingSince: since } });
      await db().pendingRecord.updateMany({ where: { taskId: t.id, clearedAt: null }, data: { since } });
      if (rand() < 0.7) await logReminder(actorOf(maker), t.id, { channel: pick(["WHATSAPP", "EMAIL", "CALL"] as const), messageText: (await pendingMessage(actorOf(maker), t.id)).text });
      pending += 1;
    } catch {
      /* a task that cannot go pending (e.g. no maker) is simply skipped */
    }
  }

  // 6. Under review: some waiting for the checker, some returned with points.
  let reviews = 0;
  for (const t of soon.filter((_, i) => i % 5 === 2)) {
    if (reviews >= 12) break;
    const maker = makerOf(t);
    const reviewStage = t.stageTemplateVersion?.stages.filter((s) => s.reviewLevel !== "NONE").sort((a, b) => a.index - b.index)[0];
    if (!maker || !reviewStage) continue;
    await db().task.update({ where: { id: t.id }, data: { stageIndex: reviewStage.index, status: "IN_PROGRESS" } });
    try {
      const req = await submitForReview(actorOf(maker), t.id, "Ready for review");
      reviews += 1;
      if (reviews % 3 === 0) {
        const checker = byId.get(req.checkerId ?? "")!;
        await returnReview(actorOf(checker), req.id, [pick(["ITC on blocked credits (s. 17(5)) to be reversed", "Interest income as per AIS not considered", "Lower deduction certificate not applied", "Director's DIN missing in the attachment"]), "Attach the reconciliation"]);
      } else {
        await db().task.update({ where: { id: t.id }, data: { underReviewSince: new Date(Date.now() - int(0, 4) * 86_400_000) } });
      }
    } catch {
      /* no eligible checker on this engagement — leave it in progress */
    }
  }

  // 7. Registers.
  const clients = await db().client.findMany({ where: { isFirm: false }, include: { directors: { include: { director: true } } } });
  const clientByName = (n: string) => clients.find((c) => c.name.startsWith(n))!;
  const mgr = (c: { managerId: string | null }) => byId.get(c.managerId ?? "") ?? P("rohan.iyer");

  // Notices (Q-13: response due = received + 15 days unless the notice says otherwise).
  const noticeDefs = [
    { c: "Dr. Anjali Deshpande", authority: "INCOME_TAX", section: "143(2)", ay: "AY 2024-25", received: addDays(today, -9), assignee: "vikram.singh", hearing: addDays(today, 12) },
    { c: "Reddy Constructions", authority: "GST", section: "ASMT-10 / 61", ay: "FY 2023-24", received: addDays(today, -13), assignee: "priya.nair" },
    { c: "Pune Auto Components", authority: "INCOME_TAX", section: "148A(b)", ay: "AY 2022-23", received: addDays(today, -25), due: addDays(today, -3), assignee: "pooja.joshi" },
    { c: "Sharma Textiles", authority: "TDS_TRACES", section: "Short deduction", ay: "FY 2025-26 Q3", received: addDays(today, -60), assignee: "karthik.reddy", close: true },
  ] as const;
  for (const n of noticeDefs) {
    const c = clientByName(n.c);
    const m = mgr(c);
    const notice = await createNotice(actorOf(m), {
      clientId: c.id, authority: n.authority, section: n.section, ayOrPeriod: n.ay, referenceNo: `ITBA/${digits(4)}/${digits(10)}`, receivedDate: n.received, noticeDate: addDays(n.received, -2),
      responseDueDate: "due" in n ? n.due : null, assigneeId: P(n.assignee).id, reviewerId: m.id, summary: "Demo notice — details as per the notice copy in the file.",
      demandRupees: n.authority === "GST" ? 184500 : 0,
    });
    if ("hearing" in n) await addHearing(actorOf(m), notice.id, { date: n.hearing, notes: "Personal hearing at the AO's office" });
    if ("close" in n) await updateNotice(actorOf(m), notice.id, { status: "CLOSED", outcome: "Short deduction corrected through a correction statement; no demand." });
  }

  // DSCs: one per director/designated partner (capped), expiry spread so every alert band shows.
  const pa = P("suresh.pillai");
  const offsets = [-12, 4, 6, 18, 27, 45, 90, 150, 240, 320, 400, 500, 610, 700];
  const directors = new Map<string, { name: string; clientIds: string[] }>();
  for (const c of clients) for (const cd of c.directors) directors.set(cd.directorId, { name: cd.director.name, clientIds: [...(directors.get(cd.directorId)?.clientIds ?? []), c.id] });
  let n = 0;
  for (const [directorId, d] of [...directors.entries()].slice(0, offsets.length)) {
    const expiry = addDays(today, offsets[n]!);
    const dsc = await createDsc(actorOf(pa), { holderName: d.name, holderType: "DIRECTOR", directorId, issuer: pick(["eMudhra", "Capricorn", "Vsign", "Pantasign"]), tokenSerial: `${alnum(4)}${digits(8)}`, issueDate: addDays(expiry, -730), expiryDate: expiry, custody: n % 3 === 0 ? "CLIENT" : "OFFICE", location: n % 3 === 0 ? "With client" : `DSC cabinet, slot ${n + 1}`, clientIds: d.clientIds });
    if (n === 2) await recordMovement(actorOf(pa), dsc.id, { toCustody: "STAFF", userId: P("ananya.das").id, location: "Taken for AOC-4 signing", note: "Return by evening" });
    n += 1;
  }

  // UDINs: generated for signed reports; two still awaiting (one beyond the setting → reminder).
  const partners = [P("arvind.mehta"), P("kavita.rao")];
  const auditClients = clients.filter((c) => ["PRIVATE_COMPANY", "PUBLIC_COMPANY"].includes(c.constitution)).slice(0, 8);
  for (const [i, c] of auditClients.entries()) {
    const signed = addDays(today, -int(5, 60));
    const awaiting = i >= 6;
    await db().uDINRecord.create({
      data: {
        clientId: c.id, documentType: pick(["Audit report (Companies Act)", "Tax audit report (3CA/3CD)", "Certificate — net worth", "CARO 2020 report"]), signingDate: awaiting ? addDays(today, i === 6 ? -10 : -2) : signed,
        partnerId: partners[i % 2]!.id, status: awaiting ? "AWAITING" : "GENERATED", udin: awaiting ? null : `${today.slice(2, 4)}${digits(6)}${alnum(10)}`, generatedOn: awaiting ? null : addDays(signed, int(0, 3)), createdById: "system",
      },
    });
  }

  // Credentials vault: portal logins for a dozen clients (fake values), granted to the GST makers.
  for (const c of clients.slice(0, 12)) {
    const owner = byId.get(c.partnerId ?? "") ?? partners[0]!;
    await addCredential(actorOf(owner), { clientId: c.id, portal: "INCOME_TAX", username: c.pan ?? `DEMO${digits(6)}`, password: `Demo@${digits(4)}`, changePeriodically: true, lastChangedOn: addDays(today, -int(20, 140)) });
    const gst = await db().gSTIN.findFirst({ where: { clientId: c.id } });
    if (gst) {
      await addCredential(actorOf(owner), { clientId: c.id, portal: "GST", label: gst.gstin, username: `${c.name.split(" ")[0]!.toLowerCase()}_${digits(3)}`, password: `Demo#${digits(4)}`, changePeriodically: true, lastChangedOn: addDays(today, -int(10, 120)) });
      const maker = await db().engagementAssignment.findFirst({ where: { role: "MAKER", toDate: null, engagement: { clientId: c.id, engagementType: "GST_RETURN" } } });
      const makerUser = maker ? byId.get(maker.userId) : undefined;
      if (makerUser && ["STAFF", "ARTICLE"].includes(makerUser.role)) await grantAccess(actorOf(owner), c.id, makerUser.id).catch(() => null);
    }
  }

  // Inward / outward register.
  for (const [i, c] of clients.slice(0, 14).entries()) {
    const date = addDays(today, -int(1, 50));
    await db().inwardOutward.create({
      data: {
        clientId: c.id, direction: i % 4 === 3 ? "OUT" : "IN", documentDesc: pick(["Original bank statements (FY 2025-26)", "Purchase invoices file", "Signed balance sheet copies", "Share certificates for verification", "Fixed deposit receipts", "Rent agreement copy"]),
        date, currentLocation: pick(["Cabinet A", "Cabinet B", "Audit room", "With staff"]), custodianUserId: i % 3 === 0 ? P("neha.gupta").id : null, returnedAt: i % 5 === 0 ? new Date() : null,
        handledById: P("suresh.pillai").id, createdById: P("suresh.pillai").id,
      },
    });
  }

  // 8. A correction request on last week's (locked) entry, waiting for the manager.
  const lastWeekEntry = await db().workEntry.findFirst({ where: { userId: P("karthik.reddy").id, date: { gte: addDays(weekStart(today), -7), lt: weekStart(today) }, clientId: { not: null } } });
  if (lastWeekEntry && dayOfWeek(today) !== 0) {
    await requestCorrection(actorOf(P("karthik.reddy")), lastWeekEntry.id, { minutes: Math.min(720, lastWeekEntry.minutes + 60), reason: "Forgot to include the client call on GSTR-1 queries" }).catch(() => null);
  }

  // 9. Today's reminders and escalations, as the 07:30 job would have raised them.
  await runReminders(today);
  return { filed: filedRows.length, entries: entries.length, pending, reviews };
}
