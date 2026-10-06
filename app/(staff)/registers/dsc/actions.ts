"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/registers/dsc";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, opt } from "../_lib/form";

function dscFields(f: FormData): svc.DscInput {
  return {
    holderName: str(f, "holderName"), holderType: str(f, "holderType") as never, dscClass: str(f, "dscClass") || "CLASS_3", dscType: str(f, "dscType") as never,
    issuer: str(f, "issuer"), tokenSerial: str(f, "tokenSerial"), issueDate: opt(f, "issueDate"), expiryDate: str(f, "expiryDate"),
    custody: str(f, "custody") as never, location: str(f, "location"), custodianUserId: opt(f, "custodianUserId"), notes: str(f, "notes"),
    clientIds: f.getAll("clientIds").map(String).filter(Boolean),
  };
}

export async function createDscAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.createDsc(actor, dscFields(f));
    revalidatePath("/registers/dsc");
    return { ok: true, message: "DSC added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateDscAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    // Custody changes go through "Record movement" so the hand-over is logged; edit leaves custody alone.
    const { custody: _c, location: _l, custodianUserId: _u, ...rest } = dscFields(f);
    await svc.updateDsc(actor, id, rest);
    revalidatePath("/registers/dsc");
    revalidatePath(`/registers/dsc/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function recordMovementAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.recordMovement(actor, id, { toCustody: str(f, "toCustody") as never, location: str(f, "location"), userId: opt(f, "userId"), clientId: opt(f, "clientId"), note: str(f, "note") });
    revalidatePath("/registers/dsc");
    revalidatePath(`/registers/dsc/${id}`);
    return { ok: true, message: "Movement recorded." };
  } catch (e) {
    return toActionError(e);
  }
}
