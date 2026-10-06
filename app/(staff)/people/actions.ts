"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as users from "@/server/services/users/service";
import { upsertEmployeeProfile } from "@/server/services/employees/service";
import { toActionError, type ActionResult } from "@/lib/action";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const b = (f: FormData, k: string) => f.get(k) === "on";

export async function createUserAction(_: ActionResult<{ id: string; tempPassword: string }>, f: FormData): Promise<ActionResult<{ id: string; tempPassword: string }>> {
  const actor = await requireStaff();
  try {
    const r = await users.createUser(actor, {
      username: s(f, "username"), displayName: s(f, "displayName"), email: s(f, "email"), mobile: s(f, "mobile"), role: s(f, "role") as never,
      isSenior: b(f, "isSenior"), designationId: s(f, "designationId") || null, reportingManagerId: s(f, "reportingManagerId") || null,
      defaultLocation: (s(f, "defaultLocation") || "OFFICE") as never, locationChangeable: b(f, "locationChangeable"),
    });
    revalidatePath("/people");
    return { ok: true, data: { id: r.user.id, tempPassword: r.tempPassword }, message: "Created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateUserAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await users.updateUser(actor, id, {
      displayName: s(f, "displayName"), email: s(f, "email"), mobile: s(f, "mobile"), role: s(f, "role") as never, isSenior: b(f, "isSenior"),
      designationId: s(f, "designationId") || null, reportingManagerId: s(f, "reportingManagerId") || null,
      defaultLocation: s(f, "defaultLocation") as never, locationChangeable: b(f, "locationChangeable"),
    });
    revalidatePath(`/people/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetPasswordAction(id: string): Promise<ActionResult<{ tempPassword: string }>> {
  const actor = await requireStaff();
  try {
    const r = await users.adminResetPassword(actor, id);
    return { ok: true, data: r, message: "Password reset." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetTotpAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await users.adminResetTotp(actor, id);
    revalidatePath(`/people/${id}`);
    return { ok: true, message: "Two-factor login reset. They will set it up again at next login." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deactivateAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await users.deactivateUser(actor, id, s(f, "reason") || "Offboarded");
    revalidatePath(`/people/${id}`);
    return { ok: true, message: "Access revoked. Check the custody list below." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reactivateAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await users.reactivateUser(actor, id);
    revalidatePath(`/people/${id}`);
    return { ok: true, message: "Reactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveProfileAction(userId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const fields = ["employeeCategory", "dateOfBirth", "gender", "personalEmail", "personalMobile", "address", "emergencyName", "emergencyPhone", "uan", "esiNumber", "qualifications", "membershipBody", "membershipNo", "joiningDate", "confirmationDate", "workStateCode"];
    const input: Record<string, unknown> = Object.fromEntries(fields.map((k) => [k, s(f, k)]));
    if (!input.membershipBody) input.membershipBody = null;
    // Sensitive fields are only sent when typed, so a blank box never erases a stored value.
    for (const k of ["pan", "aadhaar", "bankName", "bankAccount", "bankIfsc"]) if (s(f, k)) input[k] = s(f, k);
    await upsertEmployeeProfile(actor, userId, input);
    revalidatePath(`/people/${userId}`);
    return { ok: true, message: "Profile saved." };
  } catch (e) {
    return toActionError(e);
  }
}
