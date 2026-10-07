"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as pol from "@/server/services/attendance/leave-policies";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const halves = (f: FormData, k: string) => Math.round(Number(s(f, k) || "0") * 2);

async function wrap(fn: () => Promise<unknown>, message: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/hr/leave-policies");
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

const input = (f: FormData) => ({
  name: s(f, "name"), employeeCategory: s(f, "employeeCategory") as "STAFF", leaveType: s(f, "leaveType") as "PERSONAL",
  quotaHalfDays: halves(f, "quotaDays"), accrual: s(f, "accrual") as "ANNUAL", carryForwardMaxHalfDays: halves(f, "carryDays"),
  encashable: f.get("encashable") === "on", effectiveFrom: s(f, "effectiveFrom"), source: s(f, "source"),
});

export async function createPolicyAction(_: ActionResult, f: FormData) { const a = await requireStaff(); return wrap(() => pol.createPolicy(a, input(f)), "Policy added."); }
export async function updatePolicyAction(id: string, _: ActionResult, f: FormData) { const a = await requireStaff(); return wrap(() => pol.updatePolicy(a, id, input(f)), "Policy updated (verification cleared)."); }
export async function verifyPolicyAction(id: string) { const a = await requireStaff(); return wrap(() => pol.verifyPolicy(a, id), "Confirmed."); }
export async function runAccrualAction() { const a = await requireStaff(); return wrap(() => pol.runLeaveAccrualNow(a), "Accrual run: balances are up to date."); }
export async function adjustBalanceAction(id: string, _: ActionResult, f: FormData) { const a = await requireStaff(); return wrap(() => pol.adjustBalance(a, id, halves(f, "days"), s(f, "reason")), "Balance adjusted."); }
