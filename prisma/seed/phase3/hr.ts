/**
 * Phase 3 HR processes seed: recruitment, articleship, appraisals, CPE/training/skills, expenses,
 * assets, exits, HR letters and policies (spec 11.6–11.13).
 */
import type { PrismaClient } from "../../../generated/prisma/client";
import { db } from "../../../server/lib/db";
import { addDays, todayIst } from "../../../server/lib/dates";
import type { StaffActor } from "../../../server/permissions/actor";
import * as rec from "../../../server/services/hr/recruitment";
import * as art from "../../../server/services/hr/articleship";
import * as apr from "../../../server/services/hr/appraisals";
import * as growth from "../../../server/services/hr/growth";
import * as exp from "../../../server/services/hr/expenses";
import * as assets from "../../../server/services/hr/assets";
import * as exits from "../../../server/services/hr/exits";
import * as letters from "../../../server/services/hr/letters";

const VERIFY = "PLACEHOLDER — verify against the institute's current CPE announcement before relying on it (open-questions Q-09e)";

/** CPE requirements (Unverified), the skills list and placeholder policies. Idempotent. */
export async function seedHrReference(prisma: PrismaClient) {
  const cpe = [
    { institute: "ICAI", memberClass: "PRACTICE", blockStartYear: 2026, blockYears: 3, structuredMinutes: 60 * 60, totalMinutes: 120 * 60, perYearMinutes: 20 * 60, effectiveFrom: "2026-01-01", source: `ICAI CPE Advisory, block 2026-2028, members in practice. ${VERIFY}` },
    { institute: "ICAI", memberClass: "SERVICE", blockStartYear: 2026, blockYears: 3, structuredMinutes: 30 * 60, totalMinutes: 60 * 60, perYearMinutes: 10 * 60, effectiveFrom: "2026-01-01", source: `ICAI CPE Advisory, block 2026-2028, members in service. ${VERIFY}` },
    { institute: "ICSI", memberClass: "PRACTICE", blockStartYear: 2026, blockYears: 3, structuredMinutes: 0, totalMinutes: 50 * 60, perYearMinutes: 15 * 60, effectiveFrom: "2026-04-01", source: `ICSI Guidelines for Professional Development Programme hours. ${VERIFY}` },
  ];
  for (const r of cpe) {
    const existing = await prisma.cpeRequirement.findFirst({ where: { institute: r.institute, memberClass: r.memberClass, effectiveFrom: r.effectiveFrom } });
    // Never overwrite a row someone has verified or edited; only fill in when absent.
    if (!existing) await prisma.cpeRequirement.create({ data: { ...r, createdById: "system" } });
  }

  const skills: [string, string][] = [
    ["GST returns and reconciliation", "GST"], ["GST audit and annual return", "GST"], ["GST notices and appeals", "GST"],
    ["Statutory audit", "AUDIT"], ["Tax audit (Form 3CD)", "AUDIT"], ["Internal audit", "AUDIT"], ["Bank / stock audit", "AUDIT"],
    ["Income tax returns", "DIRECT_TAX"], ["TDS / TCS compliance", "DIRECT_TAX"], ["Transfer pricing (TP)", "DIRECT_TAX"], ["Assessments and appeals", "DIRECT_TAX"],
    ["ROC filings", "COMPANY_LAW"], ["Board / AGM documentation", "COMPANY_LAW"], ["LLP compliance", "COMPANY_LAW"],
    ["Bookkeeping (Tally)", "ACCOUNTING"], ["Financial statements", "ACCOUNTING"], ["Payroll and labour law returns", "ACCOUNTING"],
    ["Project finance / CMA", "ADVISORY"], ["Business valuation", "ADVISORY"],
  ];
  for (const [name, serviceLine] of skills) {
    await prisma.skill.upsert({ where: { name }, create: { name, serviceLine, createdById: "system" }, update: {} });
  }

  // Placeholders do not ask anyone to acknowledge; HR publishes the real text as version 2 with acknowledgment.
  const policies: [string, string][] = [["Leave policy", "LEAVE"], ["Code of conduct", "CONDUCT"], ["Confidentiality and client data policy", "CONFIDENTIALITY"], ["Work from home policy", "WFH"]];
  for (const [title, kind] of policies) {
    const existing = await prisma.policyDocument.findFirst({ where: { title, kind } });
    if (!existing) {
      await prisma.policyDocument.create({
        data: { title, kind, version: 1, body: `Placeholder for the firm's ${title.toLowerCase()}. HR replaces this text (HR → HR letters & policies → Publish new version) before asking staff to acknowledge.`, effectiveFrom: "2026-04-01", requiresAck: false, createdById: "system" },
      });
    }
  }
}

type U = { id: string; role: string; isSenior: boolean; displayName: string; username: string };
const actor = (u: U): StaffActor => ({ kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName });

/** Demo activity, dates relative to today. Runs once on the demo firm (skips if recruitment data exists). */
export async function seedHrDemo() {
  if ((await db().opening.count()) > 0) return;
  const today = todayIst();
  const all = await db().user.findMany({ where: { isSystem: false, active: true }, select: { id: true, role: true, isSenior: true, displayName: true, username: true } });
  const by = new Map(all.map((u) => [u.username, u]));
  const u = (name: string) => by.get(name)!;
  if (!by.has("lakshmi.narayanan")) return;
  const hr = actor(u("lakshmi.narayanan"));
  const arvind = actor(u("arvind.mehta"));
  const kavita = actor(u("kavita.rao"));
  const rohan = actor(u("rohan.iyer"));

  // ---- Recruitment: 2 openings with candidates in stages
  const o1 = await rec.createOpening(hr, { title: "Audit Associate (CA Inter / semi-qualified)", kind: "STAFF", openedAt: addDays(today, -40), ownerId: u("rohan.iyer").id });
  const o2 = await rec.createOpening(hr, { title: "Article Assistants — 2026 intake", kind: "ARTICLE", openedAt: addDays(today, -25), ownerId: u("arvind.mehta").id });
  const stages: [string, string, rec.Stage][] = [
    [o1.id, "Nikhil Agarwal", "APPLIED"], [o1.id, "Sakshi Jain", "SCREENING"], [o1.id, "Manav Choudhary", "INTERVIEW"], [o1.id, "Ritu Saxena", "OFFER"], [o1.id, "Arjun Malhotra", "REJECTED"],
    [o2.id, "Tanvi Goyal", "APPLIED"], [o2.id, "Yash Khandelwal", "TEST"], [o2.id, "Simran Kaur", "INTERVIEW"],
  ];
  for (const [openingId, name, stage] of stages) {
    const c = await rec.addCandidate(hr, { openingId, name, email: `${name.split(" ")[0]!.toLowerCase()}@example.com`, phone: `98${String(10000000 + Math.floor(Math.random() * 89999999))}`, source: "Referral" });
    const path: rec.Stage[] = { APPLIED: [], SCREENING: ["SCREENING"], TEST: ["SCREENING", "TEST"], INTERVIEW: ["SCREENING", "INTERVIEW"], OFFER: ["SCREENING", "INTERVIEW"], JOINED: [], REJECTED: ["SCREENING"] }[stage] as rec.Stage[];
    for (const s of path) await rec.moveCandidate(hr, c.id, s);
    if (stage === "INTERVIEW" || stage === "OFFER") {
      const iv = await rec.scheduleInterview(hr, c.id, { interviewerId: u("rohan.iyer").id, scheduledAt: addDays(today, stage === "OFFER" ? -7 : 2) });
      if (stage === "OFFER") {
        await rec.recordScorecard(rohan, iv.id, { scores: { "Technical knowledge": 4, Communication: 4, Attitude: 5, "Practical exposure": 3 }, recommendation: "YES", notes: "Good audit exposure; can start on stock audits." });
        await rec.generateOfferLetter(hr, c.id, { position: "Audit Associate", ctc: "Rs. 4,20,000 per annum", joiningDate: addDays(today, 21), acceptBy: addDays(today, 5) });
      }
    }
    if (stage === "REJECTED") await rec.moveCandidate(hr, c.id, "REJECTED", { reason: "Expected compensation well above budget" });
  }

  // ---- Articleship: the 6 articles, one completing within 90 days
  const articles = ["aditya.kumar", "meera.pillai", "harsh.patel", "divya.krishnan", "faizan.ali", "ishita.banerjee"].filter((n) => by.has(n));
  const startsAgo = [3 * 365 - 55, 2 * 365, 400, 300, 150, 60];
  for (const [i, name] of articles.entries()) {
    const start = addDays(today, -startsAgo[i]!);
    await art.saveArticleshipRecord(hr, u(name).id, {
      institute: i === 5 ? "ICSI" : "ICAI", registrationNo: i === 5 ? `ICSI/TR/${26000 + i}` : `WRO0${700000 + i * 137}`, principalId: (i % 2 ? kavita : arvind).userId,
      startDate: start, expectedEndDate: addDays(start, 3 * 365), leaveEntitledDays: 60, stipendYear: Math.min(3, 1 + Math.floor(startsAgo[i]! / 365)),
      notes: i === 0 ? "Completion approaching: plan the replacement from the 2026 intake." : "",
    });
  }
  const recs = await db().articleshipRecord.findMany();
  for (const r of recs.slice(0, 3)) {
    await art.addArticleshipNote(r.principalId === arvind.userId ? arvind : kavita, r.id, { kind: "FEEDBACK", date: addDays(today, -20), text: "Good grip on GST reconciliations. Needs more exposure to statutory audit fieldwork." });
    await art.addArticleshipNote(hr, r.id, { kind: "CLASS", date: addDays(today, -45), text: "ICITSS / AICITSS classes attended (two weeks)." });
  }
  await art.runArticleshipCompletion(today);

  // ---- Appraisal cycle in progress (self-review phase) with goals and some reviews
  const cycle = await apr.createCycle(hr, { name: "Half-yearly review Apr–Sep 2026", kind: "HALF_YEARLY", startDate: addDays(today, -180), endDate: addDays(today, 10) });
  const reviews = await db().appraisalReview.findMany({ where: { cycleId: cycle.id } });
  for (const r of reviews) {
    const who = all.find((x) => x.id === r.userId)!;
    await apr.addGoal(actor(who), r.id, { title: who.role === "ARTICLE" ? "Clear the next CA exam group" : "All assigned returns filed before the due date", weightPct: 50 });
    if (r.managerId) {
      const m = all.find((x) => x.id === r.managerId);
      if (m) await apr.addGoal(actor(m), r.id, { title: "Reduce review points per task", description: "Self-review working papers before submitting", weightPct: 50 });
    }
  }
  await apr.advanceCycle(hr, cycle.id);
  for (const r of reviews.slice(0, 6)) {
    const who = all.find((x) => x.id === r.userId)!;
    await apr.submitSelfReview(actor(who), r.id, { selfReview: "Met most deadlines this half; took on two new GST clients and helped juniors with reconciliations." });
  }
  const priya = reviews.find((r) => r.userId === by.get("priya.nair")?.id);
  if (priya?.managerId) {
    const m = all.find((x) => x.id === priya.managerId)!;
    if (!(await db().appraisalReview.findUniqueOrThrow({ where: { id: priya.id } })).selfSubmittedAt) await apr.submitSelfReview(actor(u("priya.nair")), priya.id, { selfReview: "Handled the GST audit season end to end." });
    await apr.submitManagerReview(actor(m), priya.id, { managerReview: "Dependable senior; reviews are thorough. Ready for more client ownership.", managerRating: 4 });
  }

  // ---- CPE logs for qualified members, training sessions
  const members = await growth.qualifiedMembers();
  const topics = ["Ind AS 116 refresher", "GST annual return changes", "Audit quality and SQC", "Faceless assessment procedures", "Companies Act amendments"];
  let t = 0;
  for (const userId of members.keys()) {
    for (let k = 0; k < 3; k++) {
      await db().cPELog.create({ data: { userId, date: addDays(today, -20 - k * 37 - t), minutes: [120, 180, 240][k]!, structured: k !== 2, provider: k === 2 ? "Self-study" : "ICAI Jaipur Branch", topic: topics[(t + k) % topics.length]!, createdById: userId } });
    }
    t += 3;
  }
  const s1 = await growth.createTrainingSession(hr, { title: "GST notices: drafting replies", date: addDays(today, -14), minutes: 120, trainer: "Rohan Iyer", cpeEligible: true });
  const s2 = await growth.createTrainingSession(hr, { title: "Induction: firm tools and confidentiality", date: addDays(today, -40), minutes: 90, trainer: "Lakshmi Narayanan", cpeEligible: false });
  await growth.createTrainingSession(hr, { title: "Tax audit Form 3CD walkthrough", date: addDays(today, 9), minutes: 150, trainer: "Kavita Rao", cpeEligible: true });
  await growth.markAttendance(hr, s1.id, all.filter((x) => ["MANAGER", "STAFF"].includes(x.role)).map((x) => x.id));
  await growth.markAttendance(hr, s2.id, all.filter((x) => x.role === "ARTICLE").map((x) => x.id));

  // ---- Skill levels for practice staff
  const skills = await db().skill.findMany();
  let n = 0;
  for (const p of all.filter((x) => ["MANAGER", "STAFF", "ARTICLE"].includes(x.role))) {
    for (const sk of skills) {
      n += 1;
      if (n % 3 === 0) continue;
      const level = p.role === "MANAGER" ? 3 + (n % 2) : p.role === "ARTICLE" ? 1 + (n % 2) : 1 + (n % 4);
      await db().employeeSkill.create({ data: { userId: p.id, skillId: sk.id, level: Math.min(4, level), createdById: hr.userId } });
    }
  }

  // ---- Expenses: conveyance from client-site entries, travel, other; some recoverable → disbursements
  const claimers = ["priya.nair", "neha.gupta", "karthik.reddy", "aditya.kumar", "vikram.singh"].filter((x) => by.has(x));
  for (const [i, name] of claimers.entries()) {
    const a = actor(u(name));
    const sugg = await exp.conveyanceSuggestions(a, today);
    for (const [k, s] of sugg.slice(0, 2).entries()) {
      // The visit may be on a client the person is no longer assigned to: then claim it without the client.
      const input = { date: s.date, kind: "CONVEYANCE" as const, amountPaise: 18_000 + i * 2_500 + k * 1_000, distanceKm: 14 + i, workEntryId: s.workEntryIds[0], description: "Client visit (two-wheeler)" };
      const c = await exp.createClaim(a, { ...input, clientId: s.clientId, clientRecoverable: k === 0 && i !== 1 }).catch(() => exp.createClaim(a, input));
      const approver = await db().user.findUnique({ where: { id: u(name).id }, select: { reportingManagerId: true } });
      const appr = approver?.reportingManagerId ? all.find((x) => x.id === approver.reportingManagerId) : undefined;
      if (appr && k === 0) await exp.decideClaim(actor(appr), c.id, true);
    }
  }
  const other = await exp.createClaim(actor(u("rohan.iyer")), { date: addDays(today, -6), kind: "TRAVEL", amountPaise: 2_45_000, description: "Train fare, Jaipur–Udaipur for stock audit" });
  await exp.decideClaim(arvind, other.id, true);
  await exp.markClaimPaid(hr, other.id, "SEPARATE");
  await exp.createClaim(actor(u("priya.nair")), { date: addDays(today, -2), kind: "OTHER", amountPaise: 65_000, description: "Courier of signed returns" });

  // ---- Assets for everyone
  let tagNo = 1;
  for (const p of all) {
    const lap = await assets.createAsset(hr, { tag: `QX-LAP-${String(tagNo).padStart(3, "0")}`, kind: "LAPTOP", description: p.role === "ARTICLE" ? "Lenovo ThinkPad E14" : "Dell Latitude 5440", serial: `SN${100000 + tagNo * 7}`, purchaseDate: "2025-04-15" });
    await assets.issueAsset(hr, lap.id, p.id, "2026-04-01");
    if (["PARTNER", "MANAGER"].includes(p.role)) {
      const ph = await assets.createAsset(hr, { tag: `QX-PH-${String(tagNo).padStart(3, "0")}`, kind: "PHONE", description: "Office mobile", serial: `IMEI${350000000 + tagNo}` });
      await assets.issueAsset(hr, ph.id, p.id, "2026-04-01");
    }
    tagNo += 1;
  }
  for (let i = 0; i < 3; i++) await assets.createAsset(hr, { tag: `QX-DG-${String(i + 1).padStart(3, "0")}`, kind: "DONGLE", description: "4G dongle for client sites" });

  // ---- One exit in progress
  if (by.has("siddharth.menon")) {
    const ex = await exits.startExit(hr, { userId: u("siddharth.menon").id, resignationDate: addDays(today, -12) });
    const items = await db().exitChecklistItem.findMany({ where: { exitCaseId: ex.id, code: "HANDOVER_NOTE" } });
    if (items[0]) await exits.toggleExitItem(hr, items[0].id, true);
  }

  // ---- Letters and policies (acknowledged by about half)
  for (const name of ["neha.gupta", "pooja.joshi"].filter((x) => by.has(x))) {
    const { letter } = await letters.generateLetter(hr, { userId: u(name).id, kind: "CONFIRMATION", extra: { confirmationDate: addDays(today, -30) }, allowMissing: true });
    await letters.markLetterIssued(hr, letter.id);
  }
  if (by.has("priya.nair")) await letters.generateLetter(hr, { userId: u("priya.nair").id, kind: "INCREMENT", extra: { newCtc: "Rs. 7,80,000 per annum", effectiveFrom: addDays(today, 25) }, allowMissing: true });
  const leave = await letters.publishPolicy(hr, { title: "Leave policy", kind: "LEAVE", body: "Leave is applied in the app and approved by your Manager. Sick leave of more than two days needs a medical certificate. Articles' leave also counts against the articleship entitlement.", effectiveFrom: "2026-04-01" });
  const conf = await letters.publishPolicy(hr, { title: "Confidentiality and client data policy", kind: "CONFIDENTIALITY", body: "Client data stays inside the firm's systems. Never share portal passwords or DSC PINs. Use only the credentials vault.", effectiveFrom: "2026-04-01" });
  for (const [i, p] of all.entries()) {
    if (i % 2 === 0) await letters.acknowledgePolicy(actor(p), leave.id);
    if (i % 3 === 0) await letters.acknowledgePolicy(actor(p), conf.id);
  }
}
