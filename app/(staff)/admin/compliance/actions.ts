"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as admin from "@/server/services/compliance/admin";

const PATH = "/admin/compliance";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);
const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

function num(f: FormData, k: string, fieldErrors: Record<string, string>, opts: { optional?: boolean } = {}): number | null {
  const raw = s(f, k);
  if (!raw && opts.optional) return null;
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) fieldErrors[k] = "Enter a number";
  return n;
}

export async function addRuleVersionAction(typeCode: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await admin.addRuleVersion(actor, typeCode, {
      paramsJson: s(f, "paramsJson"), effectiveFrom: s(f, "effectiveFrom"), source: s(f, "source"), notificationRef: s(f, "notificationRef"),
    });
    revalidatePath(PATH);
    return { ok: true, message: `Rule v${r.rule.version} added (unverified). ${r.moved} open task(s) recomputed.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyRuleAction(ruleId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await admin.verifyRule(actor, ruleId);
    revalidatePath(PATH);
    return { ok: true, message: "Marked as verified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyLateFeeAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await admin.verifyLateFee(actor, id);
    revalidatePath(PATH);
    return { ok: true, message: "Marked as verified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setHolidayPolicyAction(typeCode: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const policy = s(f, "policy");
    if (!["NONE", "NEXT_WORKING_DAY", "PREV_WORKING_DAY"].includes(policy)) return { ok: false, error: "Choose a policy.", fieldErrors: { policy: "Required" } };
    await admin.setHolidayPolicy(actor, typeCode, policy as "NONE", s(f, "reason"));
    revalidatePath(PATH);
    return { ok: true, message: "Holiday policy changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setTypeActiveAction(typeCode: string, active: boolean): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await admin.setTypeActive(actor, typeCode, active);
    revalidatePath(PATH);
    return { ok: true, message: active ? "Activated." : "Deactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addLateFeeAction(typeCode: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const fieldErrors: Record<string, string> = {};
    const perDayRupees = num(f, "perDayRupees", fieldErrors)!;
    const maxRupees = num(f, "maxRupees", fieldErrors, { optional: true });
    const interestPctPerMonth = num(f, "interestPctPerMonth", fieldErrors)!;
    if (Object.keys(fieldErrors).length) return { ok: false, error: "Check the highlighted fields.", fieldErrors };
    await admin.addLateFeeRate(actor, typeCode, { perDayRupees, maxRupees, interestPctPerMonth, effectiveFrom: s(f, "effectiveFrom"), source: s(f, "source"), note: s(f, "note") });
    revalidatePath(PATH);
    return { ok: true, message: "Late fee rate added (unverified)." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addHolidayAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await admin.addHoliday(actor, { date: s(f, "date"), name: s(f, "name"), kind: s(f, "kind") as "NATIONAL", stateCode: s(f, "stateCode") || null });
    revalidatePath(PATH);
    return { ok: true, message: "Holiday added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeHolidayAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await admin.removeHoliday(actor, id);
    revalidatePath(PATH);
    return { ok: true, message: "Holiday removed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createExtensionAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const scope: admin.ExtensionInput["scope"] = [];
    const constitution = list(f, "constitution");
    const gstFrequency = list(f, "gstFrequency");
    const state = csv(s(f, "state"));
    if (constitution.length) scope.push({ field: "constitution", values: constitution });
    if (gstFrequency.length) scope.push({ field: "gstFrequency", values: gstFrequency });
    if (state.length) scope.push({ field: "state", values: state });
    await admin.createExtension(actor, {
      typeCodes: list(f, "typeCodes"),
      periodsMode: s(f, "periodsMode") === "ALL_OPEN" ? "ALL_OPEN" : "SPECIFIC",
      periodKeys: csv(s(f, "periodKeys")),
      scope,
      newEffectiveDueDate: s(f, "newEffectiveDueDate"),
      reason: s(f, "reason"),
      notificationRef: s(f, "notificationRef"),
      supersedesId: s(f, "supersedesId") || null,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Extension saved as a draft. Preview it, then publish." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function previewExtensionAction(id: string): Promise<ActionResult<{ tasks: number; clients: number; reclassify: number }>> {
  const actor = await requireStaff();
  try {
    const p = await admin.previewExtension(actor, id);
    return { ok: true, data: p };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishExtensionAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const raw = s(f, "confirmedCount");
    if (!/^\d+$/.test(raw)) return { ok: false, error: "Type the number of affected tasks shown in the preview.", fieldErrors: { confirmedCount: "Required" } };
    const r = await admin.publishExtension(actor, id, Number(raw));
    revalidatePath(PATH);
    return { ok: true, message: `Published. ${r.tasks} task(s) moved; assignees notified.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function regenerateAction(): Promise<ActionResult<{ clients?: number; created: number; closed: number; recomputed: number }>> {
  const actor = await requireStaff();
  try {
    const r = await admin.regenerate(actor);
    revalidatePath("/", "layout");
    return { ok: true, data: r, message: "Regenerated." };
  } catch (e) {
    return toActionError(e);
  }
}
