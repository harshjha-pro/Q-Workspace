"use server";
import * as growth from "@/server/services/hr/growth";
import * as letters from "@/server/services/hr/letters";
import type { ActionResult } from "@/lib/action";
import { act, bool, fileOf, str } from "../../hr/recruitment/_act";

const P = "/me/growth";

export async function addCpeAction(_: ActionResult, f: FormData) {
  const cert = await fileOf(f, "certificate");
  return act((a) => growth.addCpeLog(a, { date: str(f, "date"), minutes: Math.round(Number(str(f, "hours") || 0) * 60), structured: bool(f, "structured"), provider: str(f, "provider"), topic: str(f, "topic") }, cert), "CPE logged.", [P]);
}

export async function confirmSuggestionAction(workEntryId: string, structured: boolean) {
  return act((a) => growth.confirmCpeSuggestion(a, workEntryId, { structured }), "Added to your CPE log.", [P]);
}

export async function deleteCpeAction(id: string) {
  return act((a) => growth.deleteCpeLog(a, id), "Removed.", [P]);
}

export async function acknowledgeAction(policyId: string) {
  return act((a) => letters.acknowledgePolicy(a, policyId), "Acknowledged.", [P]);
}
