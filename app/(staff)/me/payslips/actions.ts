"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import { parseInrToPaise } from "@/server/lib/money";
import { DECLARATION_SECTIONS } from "@/server/payroll-engine";
import { saveDeclaration, addProof } from "@/server/services/payroll/declarations";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const paise = (v: string) => (v ? parseInrToPaise(v) ?? -1 : 0);

export async function saveDeclarationAction(fyStart: number, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const items = Object.fromEntries(DECLARATION_SECTIONS.map((sec) => [sec.code, paise(s(f, `i_${sec.code}`))]));
    const submit = s(f, "intent") === "submit";
    await saveDeclaration(actor, { fyStart, regime: s(f, "regime") as "NEW" | "OLD", metro: f.get("metro") === "on", items, submit });
    revalidatePath("/me/payslips");
    return { ok: true, message: submit ? "Declaration submitted to HR." : "Saved as draft." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addProofAction(fyStart: number, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
    await addProof(actor, { fyStart, section: s(f, "section"), amountPaise: paise(s(f, "amount")), file: { name: file.name, data: Buffer.from(await file.arrayBuffer()) } });
    revalidatePath("/me/payslips");
    return { ok: true, message: "Proof uploaded." };
  } catch (e) {
    return toActionError(e);
  }
}
