"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as accounts from "@/server/services/portal/accounts";

const PATH = "/admin/portal-users";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** The link is built from the address the admin is using, so it works on the office LAN name or IP. */
async function linkFor(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/portal/invite/${token}`;
}

export async function inviteAction(_: ActionResult<{ link: string }>, f: FormData): Promise<ActionResult<{ link: string }>> {
  try {
    const actor = await requireStaff();
    const r = await accounts.invitePortalUser(actor, { clientId: str(f, "clientId"), name: str(f, "name"), email: str(f, "email"), mobile: str(f, "mobile") });
    revalidatePath(PATH);
    return { ok: true, data: { link: await linkFor(r.token) }, message: r.reusedExisting ? "This email already had portal access; the client was added and a new link made." : "Portal user invited." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function newLinkAction(portalUserId: string, _: ActionResult<{ link: string }>): Promise<ActionResult<{ link: string }>> {
  try {
    const actor = await requireStaff();
    const token = await accounts.regeneratePortalInvite(actor, portalUserId);
    revalidatePath(PATH);
    return { ok: true, data: { link: await linkFor(token) }, message: "New link made. Older links no longer work." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function linkClientAction(portalUserId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    await accounts.linkPortalUserClient(await requireStaff(), portalUserId, str(f, "clientId"));
    revalidatePath(PATH);
    return { ok: true, message: "Client added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unlinkClientAction(portalUserId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    await accounts.unlinkPortalUserClient(await requireStaff(), portalUserId, str(f, "clientId"), str(f, "reason"));
    revalidatePath(PATH);
    return { ok: true, message: "Access removed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setActiveAction(portalUserId: string, active: boolean, _: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    await accounts.setPortalUserActive(await requireStaff(), portalUserId, active, str(f, "reason"));
    revalidatePath(PATH);
    return { ok: true, message: active ? "Reactivated." : "Deactivated and signed out." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetTotpAction(portalUserId: string, _: ActionResult): Promise<ActionResult> {
  try {
    await accounts.resetPortalTotp(await requireStaff(), portalUserId);
    revalidatePath(PATH);
    return { ok: true, message: "Two-factor login reset." };
  } catch (e) {
    return toActionError(e);
  }
}
