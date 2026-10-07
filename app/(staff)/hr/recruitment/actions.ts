"use server";
import * as svc from "@/server/services/hr/recruitment";
import type { ActionResult } from "@/lib/action";
import { act, bool, opt, str } from "./_act";

const P = "/hr/recruitment";

export async function createOpeningAction(_: ActionResult, f: FormData) {
  return act((a) => svc.createOpening(a, { title: str(f, "title"), kind: str(f, "kind") as "STAFF" | "ARTICLE", openedAt: str(f, "openedAt"), ownerId: opt(f, "ownerId") }), "Opening created.", [P]);
}

export async function setOpeningStatusAction(id: string, status: "FILLED" | "CLOSED" | "OPEN") {
  return act((a) => svc.closeOpening(a, id, status), "Saved.", [P, `${P}/${id}`]);
}

export async function addCandidateAction(openingId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.addCandidate(a, { openingId, name: str(f, "name"), email: opt(f, "email"), phone: opt(f, "phone"), source: str(f, "source") }), "Candidate added.", [P, `${P}/${openingId}`]);
}

export async function moveCandidateAction(id: string, _: ActionResult, f: FormData) {
  return act((a) => svc.moveCandidate(a, id, str(f, "stage") as svc.Stage, { reason: str(f, "reason"), joinedUserId: opt(f, "joinedUserId") ?? undefined }), "Stage updated.", [P, `${P}/candidates/${id}`]);
}

export async function scheduleInterviewAction(id: string, _: ActionResult, f: FormData) {
  return act((a) => svc.scheduleInterview(a, id, { interviewerId: str(f, "interviewerId"), scheduledAt: str(f, "scheduledAt") }), "Interview scheduled.", [`${P}/candidates/${id}`]);
}

export async function scorecardAction(interviewId: string, candidateId: string, _: ActionResult, f: FormData) {
  const scores: Record<string, number> = {};
  for (const area of svc.SCORE_AREAS) {
    const v = Number(str(f, `score:${area}`));
    if (v) scores[area] = v;
  }
  return act((a) => svc.recordScorecard(a, interviewId, { scores, recommendation: str(f, "recommendation") as "YES", notes: str(f, "notes") }), "Scorecard saved.", [`${P}/candidates/${candidateId}`]);
}

export async function offerLetterAction(id: string, _: ActionResult, f: FormData) {
  return act(
    (a) => svc.generateOfferLetter(a, id, { position: str(f, "position"), ctc: str(f, "ctc"), joiningDate: str(f, "joiningDate"), acceptBy: str(f, "acceptBy"), allowMissing: bool(f, "allowMissing") }),
    "Offer letter ready. Download it below.", [`${P}/candidates/${id}`],
  );
}

export async function toggleOnboardingAction(itemId: string, done: boolean, candidateId: string) {
  return act((a) => svc.toggleOnboardingItem(a, itemId, done), done ? "Done." : "Reopened.", [P, `${P}/candidates/${candidateId}`]);
}
