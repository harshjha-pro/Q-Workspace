"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { setRetentionRule, requestPurge, decidePurge } from "@/server/services/lifecycle/retention";
import { toActionError, type ActionResult } from "@/lib/action";

export async function saveRuleAction(recordType: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const years = String(f.get("retainYears") ?? "").trim();
    await setRetentionRule(actor, recordType, { retainYears: years ? Number(years) : null, basis: String(f.get("basis") ?? ""), source: String(f.get("source") ?? ""), purgeEnabled: f.get("purgeEnabled") === "on" });
    revalidatePath("/admin/retention");
    return { ok: true, message: "Retention rule saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestPurgeAction(recordType: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await requestPurge(actor, recordType);
    revalidatePath("/admin/retention");
    return { ok: true, message: `Purge of ${r.count} record(s) sent for Partner approval.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decidePurgeAction(id: string, approve: boolean, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    if (approve && String(f.get("confirm") ?? "").trim().toUpperCase() !== "PURGE") return { ok: false, error: "Type PURGE to confirm.", fieldErrors: { confirm: "Type PURGE" } };
    const r = await decidePurge(actor, id, approve, String(f.get("reason") ?? ""));
    revalidatePath("/admin/retention");
    return { ok: true, message: approve ? `Purged ${r.purged} record(s)${r.skipped ? `, skipped ${r.skipped} no longer past retention` : ""}.` : "Request rejected." };
  } catch (e) {
    return toActionError(e);
  }
}
