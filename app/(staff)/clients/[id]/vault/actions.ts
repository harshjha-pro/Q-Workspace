"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/registers/vault";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, opt, bool } from "../../../registers/_lib/form";

const path = (clientId: string) => `/clients/${clientId}/vault`;

/** Decrypts one field on demand; the service checks access and logs the view. Never cached or revalidated. */
export async function revealAction(credentialId: string, field: "USERNAME" | "PASSWORD" | "EXTRA"): Promise<ActionResult<{ value: string }>> {
  const actor = await requireStaff();
  try {
    if (!["USERNAME", "PASSWORD", "EXTRA"].includes(field)) return { ok: false, error: "Unknown field." };
    const value = await svc.revealCredential(actor, credentialId, field);
    return { ok: true, data: { value } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addCredentialAction(clientId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.addCredential(actor, {
      clientId, portal: str(f, "portal") as never, label: str(f, "label"), username: str(f, "username"), password: String(f.get("password") ?? ""),
      extra: String(f.get("extra") ?? "") || undefined, changePeriodically: bool(f, "changePeriodically"), lastChangedOn: opt(f, "lastChangedOn"),
    });
    revalidatePath(path(clientId));
    return { ok: true, message: "Credential saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function changePasswordAction(clientId: string, id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.changePassword(actor, id, String(f.get("password") ?? ""), str(f, "username") || undefined);
    revalidatePath(path(clientId));
    return { ok: true, message: "Password updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deactivateCredentialAction(clientId: string, id: string, _: ActionResult, _f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.deactivateCredential(actor, id);
    revalidatePath(path(clientId));
    return { ok: true, message: "Credential deactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function grantAccessAction(clientId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.grantAccess(actor, clientId, str(f, "userId"), opt(f, "credentialId"));
    revalidatePath(path(clientId));
    return { ok: true, message: "Access granted." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeGrantAction(clientId: string, grantId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.revokeGrant(actor, grantId, str(f, "reason") || "Revoked");
    revalidatePath(path(clientId));
    return { ok: true, message: "Access revoked." };
  } catch (e) {
    return toActionError(e);
  }
}
