import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeUser } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst } from "@/server/lib/dates";
import { decryptJson } from "@/server/lib/crypto";
import * as rec from "@/server/services/hr/recruitment";
import * as art from "@/server/services/hr/articleship";
import * as apr from "@/server/services/hr/appraisals";
import * as growth from "@/server/services/hr/growth";
import * as exp from "@/server/services/hr/expenses";
import * as assets from "@/server/services/hr/assets";
import * as exits from "@/server/services/hr/exits";
import * as letters from "@/server/services/hr/letters";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db().firmProfile.create({ data: { name: "Test Firm", address: "Jaipur" } });
});

describe("recruitment pipeline (P3-19)", () => {
  it("moves forward only, needs a reason to reject and a login to join; builds onboarding", async () => {
    expect(rec.canMoveStage("APPLIED", "INTERVIEW").ok).toBe(true);
    expect(rec.canMoveStage("INTERVIEW", "SCREENING").ok).toBe(false);
    expect(rec.canMoveStage("TEST", "JOINED").ok).toBe(false);
    expect(rec.canMoveStage("REJECTED", "OFFER").ok).toBe(false);

    await expect(rec.createOpening(actorOf(w.m1), { title: "Audit senior", openedAt: today })).rejects.toThrow(); // Manager read-only
    await expect(rec.createOpening(actorOf(w.s1), { title: "Audit senior", openedAt: today })).rejects.toThrow();
    const o = await rec.createOpening(actorOf(w.hr), { title: "Article assistant", kind: "ARTICLE", openedAt: today });
    expect((await rec.listOpenings(actorOf(w.m1))).length).toBe(1); // Manager can read
    const c = await rec.addCandidate(actorOf(w.hr), { openingId: o.id, name: "Rhea Sharma", email: "rhea@example.com" });
    await rec.moveCandidate(actorOf(w.hr), c.id, "SCREENING");
    await expect(rec.moveCandidate(actorOf(w.hr), c.id, "APPLIED")).rejects.toThrow(/forward/);
    await expect(rec.moveCandidate(actorOf(w.hr), c.id, "JOINED")).rejects.toThrow(/offer/);

    const iv = await rec.scheduleInterview(actorOf(w.hr), c.id, { interviewerId: w.senior.id, scheduledAt: today });
    await expect(rec.recordScorecard(actorOf(w.s1), iv.id, { recommendation: "YES" })).rejects.toThrow();
    await rec.recordScorecard(actorOf(w.senior), iv.id, { scores: { Communication: 4 }, recommendation: "YES", notes: "Good" });
    expect((await rec.getCandidate(actorOf(w.senior), c.id)).interviews[0]!.recommendation).toBe("YES");

    await rec.moveCandidate(actorOf(w.hr), c.id, "INTERVIEW");
    await expect(rec.generateOfferLetter(actorOf(w.hr), c.id, { position: "Article", ctc: "", joiningDate: today, acceptBy: today })).rejects.toThrow();
    const r = await rec.generateOfferLetter(actorOf(w.hr), c.id, { position: "Article assistant", ctc: "Rs. 12,000 per month", joiningDate: addDays(today, 10), acceptBy: addDays(today, 3) });
    expect(r.missing).toEqual([]);
    const pdf = await rec.offerLetterDownload(actorOf(w.hr), c.id, "pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await rec.offerLetterDownload(actorOf(w.hr), c.id, "docx")).body.subarray(0, 2).toString()).toBe("PK");

    await expect(rec.moveCandidate(actorOf(w.hr), c.id, "JOINED")).rejects.toThrow(/People/);
    const newUser = await makeUser("ARTICLE");
    await rec.moveCandidate(actorOf(w.hr), c.id, "JOINED", { joinedUserId: newUser.id });
    const items = await db().employeeOnboardingItem.findMany({ where: { userId: newUser.id } });
    expect(items.map((i) => i.code)).toContain("ARTICLESHIP_REGISTRATION");
    expect(items).toHaveLength(5);

    const c2 = await rec.addCandidate(actorOf(w.hr), { openingId: o.id, name: "Kabir" });
    await expect(rec.moveCandidate(actorOf(w.hr), c2.id, "REJECTED")).rejects.toThrow(/reason/);
    await rec.moveCandidate(actorOf(w.hr), c2.id, "REJECTED", { reason: "Not available" });
    expect(await db().auditLog.count({ where: { entityType: "Candidate", action: "STAGE" } })).toBe(4);
  });
});

describe("articleship (P3-02)", () => {
  it("excess leave pushes completion; approaching completion is flagged; stipend only for Partner/HR", async () => {
    expect(art.completionFor({ expectedEndDate: "2027-06-30", leaveEntitledDays: 10 }, 25, { extendByExcessLeave: true })).toMatchObject({ excessDays: 3, revisedEndDate: "2027-07-03" });
    expect(art.completionFor({ expectedEndDate: "2027-06-30", leaveEntitledDays: 10 }, 25, { extendByExcessLeave: false }).revisedEndDate).toBe("2027-06-30");
    expect(art.completionFor({ expectedEndDate: "2027-06-30", leaveEntitledDays: 10 }, 20, { extendByExcessLeave: true }).excessLeave).toBe(false);

    await expect(art.saveArticleshipRecord(actorOf(w.m1), w.a1.id, { institute: "ICAI", registrationNo: "WRO123", principalId: w.partner.id, startDate: "2025-01-01", expectedEndDate: addDays(today, 60), leaveEntitledDays: 2 })).rejects.toThrow();
    await expect(art.saveArticleshipRecord(actorOf(w.hr), w.s1.id, { institute: "ICAI", registrationNo: "X", principalId: w.partner.id, startDate: "2025-01-01", expectedEndDate: addDays(today, 60), leaveEntitledDays: 2 })).rejects.toThrow(/Article/);
    await art.saveArticleshipRecord(actorOf(w.hr), w.a1.id, { institute: "ICAI", registrationNo: "WRO123", principalId: w.partner.id, startDate: "2025-01-01", expectedEndDate: addDays(today, 60), leaveEntitledDays: 2 });
    // 3 days approved leave (6 half days) vs 2 entitled → 1 excess day
    await db().leaveRequest.create({ data: { userId: w.a1.id, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: addDays(today, -40), toDate: addDays(today, -38), halfDays: 6, status: "APPROVED" } });
    const d = await art.getArticleship(actorOf(w.hr), w.a1.id);
    expect(d.summary.excessDays).toBe(1);
    expect(d.summary.revisedEndDate).toBe(addDays(today, 61));
    expect(d.summary.completionApproaching).toBe(true);
    expect(d.stipend).not.toBeNull();
    expect(await db().sensitiveViewLog.count({ where: { entityType: "ArticleshipRecord", kind: "SALARY" } })).toBe(1);

    const mine = await art.getArticleship(actorOf(w.a1), w.a1.id);
    expect(mine.stipend).toBeNull();
    const mgr = await art.getArticleship(actorOf(w.m1), w.a1.id);
    expect(mgr.stipend).toBeNull();
    await expect(art.getArticleship(actorOf(w.m2), w.a1.id)).rejects.toThrow();
    await expect(art.listArticleship(actorOf(w.s1))).rejects.toThrow();
    expect((await art.listArticleship(actorOf(w.m2))).rows).toHaveLength(0);

    await art.addArticleshipNote(actorOf(w.partner), d.record.id, { kind: "FEEDBACK", date: today, text: "Good progress on audit files" });
    await expect(art.addArticleshipNote(actorOf(w.a1), d.record.id, { kind: "FEEDBACK", date: today, text: "Self praise" })).rejects.toThrow();
    await art.addArticleshipNote(actorOf(w.a1), d.record.id, { kind: "CLASS", date: today, text: "ITT classes" });

    const job = await art.runArticleshipCompletion(today);
    expect(job.updated).toBe(1);
    expect((await db().articleshipRecord.findUniqueOrThrow({ where: { userId: w.a1.id } })).revisedEndDate).toBe(addDays(today, 61));
    expect(await db().notification.count({ where: { userId: w.hr.id, kind: "ARTICLESHIP" } })).toBe(1);
  });
});

describe("appraisals and evidence (P3-20)", () => {
  it("runs goals → self → manager → moderation with visibility rules", async () => {
    await expect(apr.createCycle(actorOf(w.m1), { name: "FY", kind: "ANNUAL", startDate: addDays(today, -200), endDate: addDays(today, 30) })).rejects.toThrow();
    const cycle = await apr.createCycle(actorOf(w.hr), { name: "FY 2026-27", kind: "ANNUAL", startDate: addDays(today, -200), endDate: addDays(today, 30), userIds: [w.s1.id, w.s2.id, w.a1.id] });
    const reviews = await db().appraisalReview.findMany({ where: { cycleId: cycle.id } });
    const r1 = reviews.find((r) => r.userId === w.s1.id)!;
    expect(r1.managerId).toBe(w.m1.id);
    expect(r1.partnerId).toBe(w.partner.id);

    // Visibility
    expect((await apr.listReviews(actorOf(w.s1))).map((r) => r.userId)).toEqual([w.s1.id]);
    expect((await apr.listReviews(actorOf(w.m1))).map((r) => r.userId).sort()).toEqual([w.s1.id, w.a1.id].sort());
    expect(await apr.listReviews(actorOf(w.hr))).toHaveLength(3);
    await expect(apr.getReview(actorOf(w.s2), r1.id)).rejects.toThrow();
    await expect(apr.getReview(actorOf(w.m2), r1.id)).rejects.toThrow();

    await apr.addGoal(actorOf(w.s1), r1.id, { title: "File all GSTR-3B on time", weightPct: 50 });
    await apr.addGoal(actorOf(w.m1), r1.id, { title: "Clear CA Final group 1", weightPct: 50 });
    await expect(apr.submitSelfReview(actorOf(w.s1), r1.id, { selfReview: "Done" })).rejects.toThrow();
    await apr.advanceCycle(actorOf(w.hr), cycle.id);
    await expect(apr.addGoal(actorOf(w.s1), r1.id, { title: "Late goal" })).rejects.toThrow();
    await expect(apr.submitSelfReview(actorOf(w.m1), r1.id, { selfReview: "Not mine" })).rejects.toThrow();
    await apr.submitSelfReview(actorOf(w.s1), r1.id, { selfReview: "Filed every return on time." });
    await expect(apr.submitManagerReview(actorOf(w.s1), r1.id, { managerReview: "me", managerRating: 5 })).rejects.toThrow(/yourself/);
    await expect(apr.submitManagerReview(actorOf(w.m2), r1.id, { managerReview: "x", managerRating: 3 })).rejects.toThrow();
    await apr.submitManagerReview(actorOf(w.m1), r1.id, { managerReview: "Reliable", managerRating: 4 });
    await expect(apr.moderateReview(actorOf(w.m1), r1.id, { moderatedRating: 4, finalRating: 4 })).rejects.toThrow();
    await expect(apr.moderateReview(actorOf(w.hr), r1.id, { moderatedRating: 4, finalRating: 4 })).rejects.toThrow();
    await apr.moderateReview(actorOf(w.partner), r1.id, { moderatedRating: 4, finalRating: 4, incrementRecommendationBp: 1000 });
    const final = await apr.getReview(actorOf(w.s1), r1.id);
    expect(final.review.status).toBe("FINAL");
    expect(final.review.incrementRecommendationBp).toBe(1000);
    expect((await apr.getReview(actorOf(w.m1), r1.id)).review.incrementRecommendationBp).toBeNull();
    expect(JSON.parse((await db().appraisalReview.findUniqueOrThrow({ where: { id: r1.id } })).evidenceSnapshotJson).hoursContext).toMatch(/logged/);
    await expect(apr.advanceCycle(actorOf(w.hr), cycle.id).then(() => apr.advanceCycle(actorOf(w.hr), cycle.id)).then(() => apr.advanceCycle(actorOf(w.hr), cycle.id))).rejects.toThrow(/not moderated/);
  });

  it("evidence panel: filings, review points, feedback, applause, CPE, exposure; client names hidden from HR", async () => {
    const from = addDays(today, -30);
    const task = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "GSTR-3B Aug", status: "FILED_LATE", filedDate: addDays(today, -5), complianceTypeCode: "X1", periodKey: "p1" } });
    const task2 = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "GSTR-1 Aug", status: "FILED", filedDate: addDays(today, -6), complianceTypeCode: "X2", periodKey: "p1" } });
    for (const t of [task, task2]) await db().taskAssignment.create({ data: { taskId: t.id, userId: w.s1.id, role: "MAKER", fromDate: from } });
    const rr = await db().reviewRequest.create({ data: { taskId: task.id, stageIndex: 1, level: "SENIOR", makerId: w.s1.id, checkerId: w.senior.id } });
    await db().reviewPoint.create({ data: { taskId: task.id, reviewRequestId: rr.id, text: "ITC mismatch", raisedById: w.senior.id } });
    await db().feedback.create({ data: { engagementId: w.e1.id, clientId: w.c1.id, rating: 5, comment: "Prompt", receivedAt: new Date() } });
    await db().applause.create({ data: { toUserId: w.s1.id, fromUserId: w.m1.id, message: "Saved the day on GST" } });
    await db().cPELog.create({ data: { userId: w.s1.id, date: addDays(today, -3), minutes: 120, topic: "GST update" } });
    await db().workEntry.create({ data: { userId: w.s1.id, date: addDays(today, -2), clientId: w.c1.id, engagementId: w.e1.id, minutes: 240 } });

    const asPartner = await apr.evidencePanel(actorOf(w.partner), w.s1.id, from, today);
    expect(asPartner.filings).toMatchObject({ onTime: 1, late: 1 });
    expect(asPartner.reviewPoints).toMatchObject({ raised: 1, tasksReviewed: 1, perTask: 1 });
    expect(asPartner.feedback).toMatchObject({ count: 1, averageRating: 5 });
    expect(asPartner.feedback.items[0]!.client).toBe(w.c1.name);
    expect(asPartner.applause.count).toBe(1);
    expect(asPartner.cpe.minutes).toBe(120);
    expect(asPartner.exposure).toEqual([{ serviceLine: "GST", sharePct: 100 }]);
    expect(asPartner.hoursContext).toBe("4 hrs logged");
    expect(JSON.stringify(asPartner)).not.toMatch(/score/i);

    const asHr = await apr.evidencePanel(actorOf(w.hr), w.s1.id, from, today);
    expect(asHr.filings.onTime).toBe(1);
    expect(asHr.feedback.count).toBe(1);
    expect(asHr.clientNamesShown).toBe(false);
    expect(JSON.stringify(asHr)).not.toContain(w.c1.name);
  });
});

describe("CPE, training, skills (P3-21)", () => {
  it("tracks CPE against the requirement, suggests Training & CPE entries, alerts shortfall", async () => {
    await db().employeeProfile.create({ data: { userId: w.m1.id, employeeCode: "EMP-T1", membershipBody: "ICAI", membershipNo: "123456" } });
    const y = Number(today.slice(0, 4));
    await db().cpeRequirement.create({ data: { institute: "ICAI", memberClass: "PRACTICE", blockStartYear: y, blockYears: 3, structuredMinutes: 60 * 60, totalMinutes: 120 * 60, perYearMinutes: 20 * 60, effectiveFrom: `${y}-01-01`, source: "test" } });
    expect(growth.blockFor({ blockStartYear: 2023, blockYears: 3 }, "2026-10-07")).toMatchObject({ fromYear: 2026, toYear: 2028 });
    await growth.addCpeLog(actorOf(w.m1), { date: today, minutes: 180, topic: "Ind AS refresher", structured: true });
    await expect(growth.addCpeLog(actorOf(w.m1), { date: today, minutes: 60, topic: "x y", userId: w.s1.id })).rejects.toThrow();
    const cat = await db().internalCategory.findFirstOrThrow({ where: { feedsCpe: true } });
    const we = await db().workEntry.create({ data: { userId: w.m1.id, date: addDays(today, -1), internalCategoryId: cat.id, minutes: 90, description: "Webinar on GST" } });
    const s = await growth.cpeSuggestions(actorOf(w.m1), today);
    expect(s.map((x) => x.id)).toContain(we.id);
    await growth.confirmCpeSuggestion(actorOf(w.m1), we.id, { structured: false });
    await expect(growth.confirmCpeSuggestion(actorOf(w.m1), we.id, { structured: false })).rejects.toThrow();
    const mine = await growth.myCpe(actorOf(w.m1), today);
    expect(mine.status!.completedMinutes).toBe(270);
    expect(mine.status!.shortfall.totalMinutes).toBe(120 * 60 - 270);
    expect(mine.status!.requirement!.verified).toBe(false);

    const r = await growth.runCpeShortfall(`${y + 2}-11-15`);
    expect(r.alerted).toBe(1);
    expect(await db().notification.count({ where: { userId: w.m1.id, kind: "CPE" } })).toBe(1);
    expect((await growth.cpeOverview(actorOf(w.hr), today)).map((x) => x.userId)).toEqual([w.m1.id]);
    await expect(growth.cpeOverview(actorOf(w.s1), today)).rejects.toThrow();
  });

  it("training attendance feeds CPE for qualified members; skill matrix is scoped", async () => {
    const t = await growth.createTrainingSession(actorOf(w.hr), { title: "GST annual return workshop", date: today, minutes: 120, cpeEligible: true });
    await expect(growth.createTrainingSession(actorOf(w.s1), { title: "x x", date: today, minutes: 60 })).rejects.toThrow();
    await growth.markAttendance(actorOf(w.hr), t.id, [w.m1.id, w.s1.id]);
    expect(await db().cPELog.count({ where: { userId: w.m1.id, provider: "Internal training" } })).toBe(1);
    expect(await db().cPELog.count({ where: { userId: w.s1.id } })).toBe(1); // only the evidence-panel row from earlier
    const skill = await db().skill.create({ data: { name: "GST returns", serviceLine: "GST" } });
    await growth.setSkillLevel(actorOf(w.s1), w.s1.id, skill.id, 2);
    await growth.setSkillLevel(actorOf(w.m1), w.s1.id, skill.id, 3);
    await expect(growth.setSkillLevel(actorOf(w.m2), w.s1.id, skill.id, 4)).rejects.toThrow();
    await expect(growth.setSkillLevel(actorOf(w.s1), w.s2.id, skill.id, 1)).rejects.toThrow();
    const m = await growth.skillMatrix(actorOf(w.m1), { serviceLine: "GST" });
    expect(m.people.find((p) => p.userId === w.s1.id)!.levels[skill.id]).toBe(3);
    expect(m.people.some((p) => p.userId === w.s2.id)).toBe(false);
    expect((await growth.skillMatrix(actorOf(w.s1))).people.map((p) => p.userId)).toEqual([w.s1.id]);
  });
});

describe("expenses and conveyance (P3-22, Q-21)", () => {
  it("suggests client-site conveyance, uses the rate if set, approval never by self, recoverable → disbursement", async () => {
    const e = await db().workEntry.create({ data: { userId: w.s1.id, date: addDays(today, -1), clientId: w.c1.id, engagementId: w.e1.id, minutes: 120, location: "CLIENT_SITE", clientSiteClientId: w.c1.id } });
    const sugg = await exp.conveyanceSuggestions(actorOf(w.s1), today);
    expect(sugg[0]).toMatchObject({ clientId: w.c1.id, client: w.c1.name, perVisitPaise: null });
    await expect(exp.createClaim(actorOf(w.s1), { date: addDays(today, -1), kind: "CONVEYANCE", mode: "TWO_WHEELER", distanceKm: 12, workEntryId: e.id })).rejects.toThrow(/amount/);
    await exp.addConveyanceRate(actorOf(w.hr), { mode: "TWO_WHEELER", ratePaise: 500, effectiveFrom: "2026-01-01" });
    await expect(exp.addConveyanceRate(actorOf(w.s1), { mode: "TWO_WHEELER", ratePaise: 1, effectiveFrom: "2026-01-01" })).rejects.toThrow();
    const c = await exp.createClaim(actorOf(w.s1), { date: addDays(today, -1), kind: "CONVEYANCE", mode: "TWO_WHEELER", distanceKm: 12, workEntryId: e.id, clientId: w.c1.id, clientRecoverable: true }, { name: "bill.pdf", data: Buffer.from("%PDF-1.4 test") });
    expect(c.amountPaise).toBe(6000);
    expect(await exp.conveyanceSuggestions(actorOf(w.s1), today)).toHaveLength(0);
    await expect(exp.createClaim(actorOf(w.s1), { date: today, kind: "OTHER", amountPaise: 100, clientId: w.c2.id })).rejects.toThrow();
    await expect(exp.createClaim(actorOf(w.hr), { date: today, kind: "OTHER", amountPaise: 100, clientId: w.c1.id })).rejects.toThrow();

    const own = await exp.createClaim(actorOf(w.m1), { date: today, kind: "OTHER", amountPaise: 2500, description: "Stationery" });
    await expect(exp.decideClaim(actorOf(w.m1), own.id, true)).rejects.toThrow(/own claim/);
    await expect(exp.decideClaim(actorOf(w.m2), c.id, true)).rejects.toThrow();
    await expect(exp.decideClaim(actorOf(w.hr), c.id, true)).rejects.toThrow();
    await expect(exp.decideClaim(actorOf(w.m1), c.id, false)).rejects.toThrow(/reason/);
    await exp.decideClaim(actorOf(w.m1), c.id, true);
    const d = await db().disbursement.findFirstOrThrow({ where: { expenseClaimId: c.id } });
    expect(d).toMatchObject({ clientId: w.c1.id, amountPaise: 6000, kind: "TRAVEL", status: "UNRECOVERED" });
    await exp.decideClaim(actorOf(w.partner), own.id, true);
    expect(await db().disbursement.count({ where: { expenseClaimId: own.id } })).toBe(0);

    const hrView = await exp.claimsForReview(actorOf(w.hr), "approved");
    expect(hrView.find((x) => x.id === c.id)!.client).toBe("(client)");
    expect(JSON.stringify(hrView)).not.toContain(w.c1.name);
    await expect(exp.markClaimPaid(actorOf(w.m1), c.id, "SEPARATE")).rejects.toThrow();
    await exp.markClaimPaid(actorOf(w.hr), c.id, "PAYROLL");
    expect((await db().expenseClaim.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PAID");
    expect((await exp.receiptDownload(actorOf(w.m1), c.id)).body.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(exp.receiptDownload(actorOf(w.s2), c.id)).rejects.toThrow();
    await expect(exp.claimsForReview(actorOf(w.s1))).rejects.toThrow();
  });
});

describe("assets and exit (P3-23, P3-24)", () => {
  it("builds the exit checklist from custody, computes F&F, letters and closes", async () => {
    const lap = await assets.createAsset(actorOf(w.hr), { tag: "QX-LAP-01", kind: "LAPTOP", description: "Dell" });
    await expect(assets.createAsset(actorOf(w.partner), { tag: "QX-2", kind: "PHONE" })).rejects.toThrow(); // Partner read-only
    await assets.issueAsset(actorOf(w.hr), lap.id, w.s1.id, addDays(today, -100));
    await expect(assets.issueAsset(actorOf(w.hr), lap.id, w.s2.id)).rejects.toThrow(/already issued/);
    expect((await assets.assetsHeldBy(w.s1.id)).map((a) => a.tag)).toEqual(["QX-LAP-01"]);
    expect((await assets.listAssets(actorOf(w.partner))).length).toBe(1);
    await expect(assets.listAssets(actorOf(w.m1))).rejects.toThrow();

    const dsc = await db().dSC.create({ data: { holderName: "Ravi Director", expiryDate: addDays(today, 200), custody: "STAFF", custodianUserId: w.s1.id } });
    await db().credentialGrant.create({ data: { clientId: w.c1.id, userId: w.s1.id, grantedById: w.m1.id } });

    await expect(exits.startExit(actorOf(w.m1), { userId: w.s1.id, resignationDate: today })).rejects.toThrow(); // Manager read-only
    const ex = await exits.startExit(actorOf(w.hr), { userId: w.s1.id, resignationDate: today, noticeDays: 30, lastWorkingDate: addDays(today, 20) });
    let d = await exits.getExit(actorOf(w.hr), ex.id);
    const codes = d.exit.items.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining([`ASSET:${lap.id}`, `DSC:${dsc.id}`, "VAULT", "TASKS", "HANDOVER_NOTE", "FNF", "LETTERS"]));
    expect(codes.some((c) => c.startsWith("TEAM:"))).toBe(true);
    expect(JSON.stringify(d.exit.items)).not.toContain(w.c1.name);
    expect((await exits.getExit(actorOf(w.m1), ex.id)).fnf).toBeNull();
    await expect(exits.getExit(actorOf(w.m2), ex.id)).rejects.toThrow();

    const assetItem = d.exit.items.find((i) => i.code === `ASSET:${lap.id}`)!;
    await expect(exits.toggleExitItem(actorOf(w.hr), assetItem.id, true)).rejects.toThrow(/Still held/);
    await assets.returnAsset(actorOf(w.hr), lap.id, "GOOD");
    await db().dSC.update({ where: { id: dsc.id }, data: { custody: "OFFICE", custodianUserId: null } });
    await db().credentialGrant.updateMany({ where: { userId: w.s1.id }, data: { revokedAt: new Date() } });
    await db().clientTeamMember.updateMany({ where: { userId: w.s1.id }, data: { toDate: today } });
    await db().engagementAssignment.updateMany({ where: { userId: w.s1.id }, data: { toDate: today } });
    await db().taskAssignment.updateMany({ where: { userId: w.s1.id }, data: { toDate: today } });
    await exits.refreshChecklist(actorOf(w.hr), ex.id);
    d = await exits.getExit(actorOf(w.hr), ex.id);
    expect(d.exit.items.filter((i) => !i.done).map((i) => i.code).sort()).toEqual(["FNF", "HANDOVER_NOTE", "LETTERS"]);

    await expect(exits.computeAndSaveFnf(actorOf(w.m1), ex.id, { monthlyGrossPaise: 3_000_000 })).rejects.toThrow();
    const fnf = await exits.computeAndSaveFnf(actorOf(w.hr), ex.id, { monthlyGrossPaise: 3_000_000, unpaidDays: 10, leaveEncashDays: 5, advancesPaise: 50_000 });
    expect(fnf.noticeShortfallDays).toBe(10);
    expect(fnf.encashmentAllowed).toBe(false); // no encashable leave policy
    expect(fnf.netPaise).toBe(fnf.salaryPaise - fnf.noticeRecoveryPaise - 50_000);
    const stored = await db().exitCase.findUniqueOrThrow({ where: { id: ex.id } });
    expect(decryptJson<{ netPaise: number }>(stored.ffComputedEnc!, "PII").netPaise).toBe(fnf.netPaise);
    expect(JSON.stringify(await db().auditLog.findMany({ where: { entityId: ex.id } }))).not.toContain(String(fnf.netPaise));

    await expect(exits.advanceExit(actorOf(w.hr), ex.id).then(() => exits.advanceExit(actorOf(w.hr), ex.id)).then(() => exits.advanceExit(actorOf(w.hr), ex.id))).rejects.toThrow();
    const handover = d.exit.items.find((i) => i.code === "HANDOVER_NOTE")!;
    await exits.toggleExitItem(actorOf(w.hr), handover.id, true);
    await exits.generateExitLetter(actorOf(w.hr), ex.id, "RELIEVING");
    await expect(exits.generateExitLetter(actorOf(w.hr), ex.id, "EXPERIENCE", { position: "Senior Associate" })).rejects.toThrow(/blank/);
    await exits.generateExitLetter(actorOf(w.hr), ex.id, "EXPERIENCE", { position: "Senior Associate" }, true);
    expect((await db().exitChecklistItem.findFirstOrThrow({ where: { exitCaseId: ex.id, code: "LETTERS" } })).done).toBe(true);
    while ((await db().exitCase.findUniqueOrThrow({ where: { id: ex.id } })).status !== "CLOSED") await exits.advanceExit(actorOf(w.hr), ex.id);
    expect(await db().hRLetter.count({ where: { userId: w.s1.id } })).toBe(2);
  });

  it("article exit records institute paperwork on the articleship record", async () => {
    const ex = await exits.startExit(actorOf(w.hr), { userId: w.a1.id, resignationDate: today });
    expect(ex.noticeDays).toBe(30);
    expect((await exits.getExit(actorOf(w.hr), ex.id)).exit.items.some((i) => i.code === "INSTITUTE")).toBe(true);
    await exits.recordInstitutePaperwork(actorOf(w.hr), ex.id, { outcome: "TERMINATED", date: today, note: "Form 109 filed" });
    expect((await db().articleshipRecord.findUniqueOrThrow({ where: { userId: w.a1.id } })).status).toBe("TERMINATED");
  });
});

describe("HR letters and policies (P3-25)", () => {
  it("generates letters from templates, gaps are reported, staff see only issued own letters", async () => {
    await expect(letters.generateLetter(actorOf(w.partner), { userId: w.s2.id, kind: "CONFIRMATION", extra: { confirmationDate: today } })).rejects.toThrow();
    await expect(letters.generateLetter(actorOf(w.hr), { userId: w.s2.id, kind: "INCREMENT", extra: {} })).rejects.toThrow(/blank/);
    const { letter } = await letters.generateLetter(actorOf(w.hr), { userId: w.s2.id, kind: "INCREMENT", extra: { newCtc: "Rs. 6,00,000", effectiveFrom: today } });
    expect(await letters.listLetters(actorOf(w.s2))).toHaveLength(0);
    await expect(letters.letterDownload(actorOf(w.s2), letter.id, "pdf")).rejects.toThrow();
    await letters.markLetterIssued(actorOf(w.hr), letter.id);
    expect(await letters.listLetters(actorOf(w.s2))).toHaveLength(1);
    expect((await letters.letterDownload(actorOf(w.s2), letter.id, "pdf")).body.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(letters.letterDownload(actorOf(w.m2), letter.id, "pdf")).rejects.toThrow();
    await letters.letterDownload(actorOf(w.partner), letter.id, "docx");
    expect(await db().sensitiveViewLog.count({ where: { entityType: "HRLetter", kind: "SALARY" } })).toBe(1);
    expect(await letters.letterPreview(actorOf(w.hr), letter.id)).toContain("Rs. 6,00,000");
  });

  it("policy versions and acknowledgments", async () => {
    await expect(letters.publishPolicy(actorOf(w.s1), { title: "Leave policy", kind: "LEAVE", body: "Ten days of leave...", effectiveFrom: today })).rejects.toThrow();
    const v1 = await letters.publishPolicy(actorOf(w.hr), { title: "Leave policy", kind: "LEAVE", body: "Leave policy text v1", effectiveFrom: today });
    expect((await letters.outstandingAcknowledgments(actorOf(w.s2))).map((p) => p.id)).toEqual([v1.id]);
    await letters.acknowledgePolicy(actorOf(w.s2), v1.id);
    expect(await letters.outstandingAcknowledgments(actorOf(w.s2))).toHaveLength(0);
    const v2 = await letters.publishPolicy(actorOf(w.hr), { title: "Leave policy", kind: "LEAVE", body: "Leave policy text v2", effectiveFrom: today });
    expect(v2.version).toBe(2);
    expect((await letters.outstandingAcknowledgments(actorOf(w.s2))).map((p) => p.id)).toEqual([v2.id]);
    await expect(letters.acknowledgePolicy(actorOf(w.s2), v1.id)).rejects.toThrow(/newer/);
    const status = await letters.policyStatus(actorOf(w.hr));
    expect(status[0]!.acknowledged).toBe(0);
    await expect(letters.policyStatus(actorOf(w.partner))).rejects.toThrow();
  });
});
