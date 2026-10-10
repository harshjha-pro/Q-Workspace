import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { addDays, diffDays, fyStartYear, isoFromParts, todayIst } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { cpeStatus, qualifiedMembers } from "../hr/growth";
import { assertHrAnalytics, pct, resolvePeriod } from "./common";

/**
 * People dashboard (P5-06): Partner and HR Admin (analytics.hr). Headcount, joiners and leavers, attrition,
 * tenure, leave taken, recruitment pipeline, appraisal progress, articleship and CPE compliance.
 * Firm-level counts only: no client data, no salary, and no per-person hours or rankings.
 * Attrition (12 months) = leavers in the last 12 months ÷ average of headcount 12 months ago and today.
 */
const CANDIDATE_STAGES = ["APPLIED", "SCREENING", "TEST", "INTERVIEW", "OFFER", "JOINED", "REJECTED"] as const;

export async function peopleDashboard(actor: Actor, opts: { period?: string; today?: string } = {}) {
  assertHrAnalytics(actor);
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const yearAgo = addDays(today, -365);
  const fyFrom = isoFromParts(fyStartYear(today), 4, 1);
  const completionAlert = await getSetting<number>("articleship.completionAlertDays", 90);

  const [users, profiles, exits, leave, pendingLeave, openings, candidates, cycle, articles] = await Promise.all([
    db().user.findMany({ where: { isSystem: false }, select: { id: true, active: true, role: true, createdAt: true, deactivatedAt: true, designation: { select: { name: true, level: true } } } }),
    db().employeeProfile.findMany({ select: { userId: true, employeeCategory: true, joiningDate: true, exitDate: true } }),
    db().exitCase.findMany({ select: { userId: true, status: true, lastWorkingDate: true } }),
    db().leaveRequest.findMany({ where: { status: "APPROVED", fromDate: { lte: period.to }, toDate: { gte: period.from } }, select: { leaveType: true, fromDate: true, toDate: true, halfDays: true } }),
    db().leaveRequest.count({ where: { status: "PENDING" } }),
    db().opening.findMany({ where: { status: "OPEN" }, select: { id: true } }),
    db().candidate.findMany({ select: { stage: true, updatedAt: true, opening: { select: { status: true } } } }),
    db().appraisalCycle.findFirst({ where: { status: { not: "CLOSED" } }, orderBy: { startDate: "desc" }, select: { name: true, status: true, reviews: { select: { selfSubmittedAt: true, managerSubmittedAt: true, finalRating: true } } } }),
    db().articleshipRecord.findMany({ where: { status: "ACTIVE" }, select: { expectedEndDate: true, revisedEndDate: true } }),
  ]);

  const profile = new Map(profiles.map((p) => [p.userId, p]));
  const joinOf = (u: (typeof users)[number]) => profile.get(u.id)?.joiningDate ?? u.createdAt.toISOString().slice(0, 10);
  const exitOf = (u: (typeof users)[number]) => profile.get(u.id)?.exitDate ?? exits.find((e) => e.userId === u.id && e.status === "CLOSED")?.lastWorkingDate ?? (u.deactivatedAt ? u.deactivatedAt.toISOString().slice(0, 10) : null);
  const onRoll = (u: (typeof users)[number], d: string) => joinOf(u) <= d && (!exitOf(u) || exitOf(u)! > d);
  const active = users.filter((u) => u.active);

  const byDesig = new Map<string, { name: string; level: number; count: number }>();
  for (const u of active) {
    const k = u.designation?.name ?? "No designation";
    const r = byDesig.get(k) ?? { name: k, level: u.designation?.level ?? -1, count: 0 };
    r.count += 1;
    byDesig.set(k, r);
  }
  const byCategory = new Map<string, number>();
  for (const u of active) { const c = profile.get(u.id)?.employeeCategory ?? "STAFF"; byCategory.set(c, (byCategory.get(c) ?? 0) + 1); }
  const tenure = [
    { label: "Under 1 year", max: 365, count: 0 },
    { label: "1–3 years", max: 365 * 3, count: 0 },
    { label: "3–5 years", max: 365 * 5, count: 0 },
    { label: "Over 5 years", max: Infinity, count: 0 },
  ];
  for (const u of active) tenure.find((t) => diffDays(joinOf(u), today) < t.max)!.count += 1;

  const joiners = users.filter((u) => joinOf(u) >= period.from && joinOf(u) <= period.to).length;
  const leaversPeriod = users.filter((u) => { const x = exitOf(u); return !!x && x >= period.from && x <= period.to; }).length;
  const leavers12 = users.filter((u) => { const x = exitOf(u); return !!x && x > yearAgo && x <= today; }).length;
  const avgHead = (users.filter((u) => onRoll(u, yearAgo)).length + users.filter((u) => onRoll(u, today)).length) / 2;

  // Leave days inside the period by type (half-days ÷ 2, prorated to the overlap by calendar days).
  const leaveByType = new Map<string, number>();
  for (const l of leave) {
    const span = diffDays(l.fromDate, l.toDate) + 1;
    const from = l.fromDate < period.from ? period.from : l.fromDate;
    const to = l.toDate > period.to ? period.to : l.toDate;
    const days = (l.halfDays / 2) * ((diffDays(from, to) + 1) / span);
    leaveByType.set(l.leaveType, (leaveByType.get(l.leaveType) ?? 0) + days);
  }

  // CPE: qualified members with a shortfall for the current year.
  const members = await qualifiedMembers();
  let cpeShort = 0;
  for (const [userId, institute] of members) if ((await cpeStatus(userId, institute, today)).shortfall.yearMinutes > 0) cpeShort += 1;
  const cpeLogged = await db().cPELog.aggregate({ where: { date: { gte: fyFrom, lte: today }, userId: { in: active.map((u) => u.id) } }, _sum: { minutes: true } });

  const endOf = (a: { expectedEndDate: string; revisedEndDate: string | null }) => a.revisedEndDate ?? a.expectedEndDate;
  const reviews = cycle?.reviews ?? [];
  return {
    period,
    headline: {
      headcount: active.length,
      joiners,
      leavers: leaversPeriod,
      attritionPct: avgHead > 0 ? pct(leavers12, avgHead) : null,
      leavers12,
      onNotice: exits.filter((e) => e.status !== "CLOSED").length,
      pendingLeave,
      openPositions: openings.length,
      activeArticles: articles.length,
      articlesCompletingSoon: articles.filter((a) => endOf(a) >= today && endOf(a) <= addDays(today, completionAlert)).length,
      cpeMembers: members.size,
      cpeShortfall: cpeShort,
      cpeHoursThisFy: Math.round(((cpeLogged._sum.minutes ?? 0) / 60) * 10) / 10,
    },
    byDesignation: [...byDesig.values()].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)).map(({ name, count }) => ({ name, count })),
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    tenure: tenure.map(({ label, count }) => ({ label, count })),
    leaveByType: [...leaveByType.entries()].map(([type, days]) => ({ type, days: Math.round(days * 10) / 10 })).sort((a, b) => b.days - a.days),
    recruitment: CANDIDATE_STAGES.map((s) => ({ stage: s, count: candidates.filter((c) => c.stage === s && (c.opening.status === "OPEN" || ["JOINED", "REJECTED"].includes(s))).length })),
    appraisal: cycle ? { name: cycle.name, status: cycle.status, reviews: reviews.length, selfDone: reviews.filter((r) => r.selfSubmittedAt).length, managerDone: reviews.filter((r) => r.managerSubmittedAt).length, finalised: reviews.filter((r) => r.finalRating !== null).length } : null,
  };
}
