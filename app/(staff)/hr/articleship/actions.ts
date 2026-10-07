"use server";
import * as svc from "@/server/services/hr/articleship";
import type { ActionResult } from "@/lib/action";
import { act, str } from "../recruitment/_act";

export async function saveRecordAction(userId: string, _: ActionResult, f: FormData) {
  return act(
    (a) => svc.saveArticleshipRecord(a, userId, {
      institute: str(f, "institute") as "ICAI", registrationNo: str(f, "registrationNo"), principalId: str(f, "principalId"), startDate: str(f, "startDate"),
      expectedEndDate: str(f, "expectedEndDate"), leaveEntitledDays: str(f, "leaveEntitledDays"), stipendYear: str(f, "stipendYear") || 1, notes: str(f, "notes"),
    }),
    "Articleship record saved.", ["/hr/articleship", `/hr/articleship/${userId}`, "/me/articleship"],
  );
}

export async function addNoteAction(recordId: string, userId: string, _: ActionResult, f: FormData) {
  return act((a) => svc.addArticleshipNote(a, recordId, { kind: str(f, "kind") as "FEEDBACK", date: str(f, "date"), text: str(f, "text") }), "Note added.", [`/hr/articleship/${userId}`, "/me/articleship"]);
}
