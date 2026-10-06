"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/clients/service";
import { toActionError, type ActionResult } from "@/lib/action";
import type { ClientFlag } from "@/server/domain/enums";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const b = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

export async function createClientAction(input: svc.ClientInput & { flags?: Partial<Record<ClientFlag, boolean>> }): Promise<ActionResult<{ id: string }>> {
  const actor = await requireStaff();
  try {
    const c = await svc.createClient(actor, input);
    revalidatePath("/clients");
    return { ok: true, data: { id: c.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateClientAction(id: string, input: Partial<svc.ClientInput>): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateClient(actor, id, input);
    revalidatePath(`/clients/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setFlagsAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const flags = Object.fromEntries(f.getAll("flagKeys").map((k) => [String(k), b(f, `flag_${String(k)}`)]));
    await svc.setClientFlags(actor, id, { flags, effectiveDate: s(f, "effectiveDate"), reason: s(f, "reason") });
    revalidatePath(`/clients/${id}`);
    return { ok: true, message: "Flags updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setStatusAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.setClientStatus(actor, id, { status: s(f, "status") as never, effectiveDate: s(f, "effectiveDate"), reason: s(f, "reason") });
    revalidatePath(`/clients/${id}`);
    return { ok: true, message: "Status changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addGstinAction(clientId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.addGstin(actor, clientId, {
      gstin: s(f, "gstin"), tradeName: s(f, "tradeName"), frequency: s(f, "frequency") as never, frequencyEffectiveFrom: s(f, "frequencyEffectiveFrom"),
      iffOpted: b(f, "iffOpted"), annualReturnApplicable: b(f, "annualReturnApplicable"), gstr9cApplicable: b(f, "gstr9cApplicable"), registrationDate: s(f, "registrationDate"),
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "GSTIN added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateGstinAction(clientId: string, gstinId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateGstin(actor, gstinId, {
      frequency: s(f, "frequency") as never, frequencyEffectiveFrom: s(f, "frequencyEffectiveFrom") || undefined, iffOpted: b(f, "iffOpted"),
      annualReturnApplicable: b(f, "annualReturnApplicable"), gstr9cApplicable: b(f, "gstr9cApplicable"), status: s(f, "status") as never,
      cancellationDate: s(f, "cancellationDate"), reason: s(f, "reason"),
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "GSTIN updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addDirectorAction(clientId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.addDirector(actor, clientId, { din: s(f, "din"), name: s(f, "name"), pan: s(f, "pan"), email: s(f, "email"), mobile: s(f, "mobile"), designation: s(f, "designation") || "DIRECTOR", appointedOn: s(f, "appointedOn") });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "Director linked." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function ceaseDirectorAction(clientId: string, directorId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.ceaseDirector(actor, clientId, directorId, s(f, "ceasedOn"));
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "Director ceased." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveContactAction(clientId: string, contactId: string | undefined, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.saveContact(actor, clientId, {
      name: s(f, "name"), role: s(f, "role"), email: s(f, "email"), phone: s(f, "phone"), whatsapp: s(f, "whatsapp"),
      preferredChannel: (s(f, "preferredChannel") || "EMAIL") as never, isPrimary: b(f, "isPrimary"), isBilling: b(f, "isBilling"), birthday: s(f, "birthday"), notes: s(f, "notes"),
    }, contactId);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "Contact saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addPtAction(clientId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.addPtRegistration(actor, clientId, { stateCode: s(f, "stateCode"), kind: (s(f, "kind") || "EMPLOYER") as never, registrationNo: s(f, "registrationNo"), frequency: (s(f, "frequency") || "MONTHLY") as never, effectiveFrom: s(f, "effectiveFrom") });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "PT registration added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createGroupAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  const actor = await requireStaff();
  try {
    const g = await svc.createGroup(actor, name);
    return { ok: true, data: { id: g.id, name: g.name } };
  } catch (e) {
    return toActionError(e);
  }
}
