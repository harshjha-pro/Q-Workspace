import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import type { StaffActor } from "@/server/permissions/actor";
import { toActionError, type ActionResult } from "@/lib/action";

/**
 * Shared wrapper for the HR process server actions: resolve the actor, run the service call,
 * revalidate the pages that show the result and map errors for the form.
 */
export async function act(fn: (actor: StaffActor) => Promise<unknown>, message: string, paths: string[]): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await fn(actor);
    for (const p of paths) revalidatePath(p);
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const opt = (f: FormData, k: string) => str(f, k) || null;
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
/** Rupees typed in a form → paise (blank → null). */
export const rupees = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[₹,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export async function fileOf(f: FormData, k: string) {
  const file = f.get(k);
  if (!(file instanceof File) || file.size === 0) return undefined;
  return { name: file.name, data: Buffer.from(await file.arrayBuffer()) };
}
