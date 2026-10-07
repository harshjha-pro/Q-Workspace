"use server";
import * as svc from "@/server/services/hr/exits";
import type { ActionResult } from "@/lib/action";
import { act, bool, rupees, str } from "../recruitment/_act";

const P = "/hr/exits";

export async function startExitAction(_: ActionResult, f: FormData) {
  const nd = str(f, "noticeDays");
  return act((a) => svc.startExit(a, { userId: str(f, "userId"), resignationDate: str(f, "resignationDate"), noticeDays: nd ? Number(nd) : null, lastWorkingDate: str(f, "lastWorkingDate") || null }), "Exit started; the handover checklist is ready.", [P]);
}

export async function updateDatesAction(id: string, _: ActionResult, f: FormData) {
  return act((a) => svc.updateExitDates(a, id, { lastWorkingDate: str(f, "lastWorkingDate"), noticeDays: Number(str(f, "noticeDays")) }), "Saved.", [P, `${P}/${id}`]);
}

export async function refreshAction(id: string) {
  return act((a) => svc.refreshChecklist(a, id), "Checklist refreshed from current custody.", [`${P}/${id}`]);
}

export async function toggleItemAction(itemId: string, done: boolean, id: string) {
  return act((a) => svc.toggleExitItem(a, itemId, done), done ? "Done." : "Reopened.", [`${P}/${id}`, P]);
}

export async function advanceAction(id: string) {
  return act((a) => svc.advanceExit(a, id), "Moved to the next step.", [P, `${P}/${id}`]);
}

export async function fnfAction(id: string, _: ActionResult, f: FormData) {
  return act(
    (a) => svc.computeAndSaveFnf(a, id, {
      monthlyGrossPaise: rupees(f, "monthlyGross") ?? NaN, unpaidDays: str(f, "unpaidDays") || 0, leaveEncashDays: str(f, "leaveEncashDays") || 0,
      waiveNoticeRecovery: bool(f, "waiveNoticeRecovery"), assetRecoveryPaise: rupees(f, "assetRecovery") ?? 0, advancesPaise: rupees(f, "advances") ?? 0,
      otherEarningsPaise: rupees(f, "otherEarnings") ?? 0, otherDeductionsPaise: rupees(f, "otherDeductions") ?? 0, notes: str(f, "notes"),
    }),
    "Full and final computed.", [`${P}/${id}`, P],
  );
}

export async function letterAction(id: string, _: ActionResult, f: FormData) {
  return act((a) => svc.generateExitLetter(a, id, str(f, "kind") as "RELIEVING", { position: str(f, "position") }, bool(f, "allowMissing")), "Letter generated.", [`${P}/${id}`, "/hr/letters"]);
}

export async function instituteAction(id: string, _: ActionResult, f: FormData) {
  return act((a) => svc.recordInstitutePaperwork(a, id, { outcome: str(f, "outcome") as "COMPLETED", date: str(f, "date"), note: str(f, "note") }), "Recorded.", [`${P}/${id}`, "/hr/articleship"]);
}
