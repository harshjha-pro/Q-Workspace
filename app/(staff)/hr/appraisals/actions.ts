"use server";
import * as svc from "@/server/services/hr/appraisals";
import * as growth from "@/server/services/hr/growth";
import type { ActionResult } from "@/lib/action";
import { act, bool, str } from "../recruitment/_act";

const P = "/hr/appraisals";

export async function createCycleAction(_: ActionResult, f: FormData) {
  return act((a) => svc.createCycle(a, { name: str(f, "name"), kind: str(f, "kind") as "ANNUAL", startDate: str(f, "startDate"), endDate: str(f, "endDate") }), "Cycle started. Everyone has been asked to set goals.", [P]);
}

export async function advanceCycleAction(cycleId: string) {
  return act((a) => svc.advanceCycle(a, cycleId), "Moved to the next phase.", [P]);
}

export async function addGoalAction(reviewId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.addGoal(a, reviewId, { title: str(f, "title"), description: str(f, "description"), weightPct: str(f, "weightPct") || 0 }), "Goal added.", [`${P}/${reviewId}`, "/me/growth"]);
}

export async function removeGoalAction(goalId: string, reviewId: string) {
  return act((a) => svc.removeGoal(a, goalId), "Goal removed.", [`${P}/${reviewId}`, "/me/growth"]);
}

function goalFields(f: FormData, prefix: string) {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = String(v);
  return out;
}

export async function selfReviewAction(reviewId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.submitSelfReview(a, reviewId, { selfReview: str(f, "selfReview"), goalComments: goalFields(f, "goal:"), goalStatus: goalFields(f, "status:") }), "Self-review submitted.", [`${P}/${reviewId}`, P, "/me/growth"]);
}

export async function managerReviewAction(reviewId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.submitManagerReview(a, reviewId, { managerReview: str(f, "managerReview"), managerRating: str(f, "managerRating"), goalComments: goalFields(f, "goal:") }), "Manager review submitted.", [`${P}/${reviewId}`, P]);
}

export async function moderateAction(reviewId: string, _: ActionResult, f: FormData) {
  const pct = str(f, "incrementPct");
  return act(
    (a) => svc.moderateReview(a, reviewId, { moderatedRating: str(f, "moderatedRating"), finalRating: str(f, "finalRating"), incrementRecommendationBp: pct ? Math.round(Number(pct) * 100) : null }),
    "Moderated. The appraisal is final.", [`${P}/${reviewId}`, P],
  );
}

export async function createTrainingAction(_: ActionResult, f: FormData) {
  return act((a) => growth.createTrainingSession(a, { title: str(f, "title"), date: str(f, "date"), minutes: Math.round(Number(str(f, "hours") || 0) * 60), trainer: str(f, "trainer"), cpeEligible: bool(f, "cpeEligible") }), "Session added.", [`${P}/growth`, "/me/growth"]);
}

export async function attendanceAction(sessionId: string, _: ActionResult, f: FormData) {
  return act((a) => growth.markAttendance(a, sessionId, f.getAll("userIds").map(String)), "Attendance saved.", [`${P}/growth`, "/me/growth"]);
}

export async function addSkillAction(_: ActionResult, f: FormData) {
  return act((a) => growth.addSkill(a, str(f, "name"), str(f, "serviceLine")), "Skill added.", [`${P}/growth`]);
}

export async function setSkillAction(userId: string, skillId: string, level: number) {
  return act((a) => growth.setSkillLevel(a, userId, skillId, level), "Saved.", [`${P}/growth`, "/me/growth"]);
}
