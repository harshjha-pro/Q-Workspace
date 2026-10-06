"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as teams from "@/server/services/teams/service";
import * as imports from "@/server/services/import/service";
import * as backups from "@/server/services/backup/service";
import { runJob } from "@/server/scheduler";
import { updateSetting } from "@/server/services/settings/service";
import { resetDemoData } from "@/server/services/system/demo";
import type { ImportKind } from "@/server/services/import/definitions";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createTeamAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await teams.createTeam(actor, { name: s(f, "name"), leadManagerId: s(f, "leadManagerId") || null });
    revalidatePath("/admin/teams");
    return { ok: true, message: "Team created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addMemberAction(teamId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await teams.addTeamMember(actor, teamId, s(f, "userId"));
    revalidatePath("/admin/teams");
    return { ok: true, message: "Added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeMemberAction(teamId: string, userId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await teams.removeTeamMember(actor, teamId, userId);
    revalidatePath("/admin/teams");
    return { ok: true, message: "Removed; vault access for this team's clients revoked." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function validateImportAction(_: ActionResult<{ jobId: string }>, f: FormData): Promise<ActionResult<{ jobId: string }>> {
  const actor = await requireStaff();
  try {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the filled-in .xlsx file." };
    const job = await imports.validateImport(actor, s(f, "kind") as ImportKind, file.name, Buffer.from(await file.arrayBuffer()));
    revalidatePath("/admin/import");
    return { ok: true, data: { jobId: job.id }, message: "Checked." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function applyImportAction(jobId: string): Promise<ActionResult<{ created: number; notes: string[]; tempPasswords?: { username: string; tempPassword: string }[] }>> {
  const actor = await requireStaff();
  try {
    const r = await imports.applyImport(actor, jobId);
    revalidatePath("/admin/import");
    return { ok: true, data: r, message: `Imported ${r.created} record(s).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function backupNowAction(): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await backups.backupNow(actor);
    revalidatePath("/admin/backups");
    return { ok: true, message: `Backup ${r.fileName} created.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestRestoreAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await backups.requestRestore(actor, id, s(f, "note"));
    revalidatePath("/admin/backups");
    return { ok: true, message: "Restore requested. A Partner must approve it." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveRestoreAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    if (s(f, "confirm") !== "RESTORE") return { ok: false, error: "Type RESTORE to confirm.", fieldErrors: { confirm: "Type RESTORE" } };
    const r = await backups.approveAndRestore(actor, id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Restored from ${r.restoredFrom}. The state before restoring was saved as ${r.preRestoreBackup}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function uploadBackupAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a backup .zip file." };
    await backups.uploadBackup(actor, file.name, Buffer.from(await file.arrayBuffer()));
    revalidatePath("/admin/backups");
    return { ok: true, message: "Backup uploaded and verified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function runJobAction(code: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const run = await runJob(code, "MANUAL", actor);
    revalidatePath("/admin/jobs");
    return run ? { ok: run.status === "SUCCESS", message: `Finished: ${run.status.toLowerCase()}`, error: run.error ?? "Failed" } as ActionResult : { ok: true, message: "Already running." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateSettingAction(key: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const raw = s(f, "value");
    let value: unknown = raw;
    const kind = s(f, "kind");
    if (kind === "number") value = Number(raw);
    if (kind === "boolean") value = f.get("value") === "on";
    if (kind === "object") value = JSON.parse(raw);
    await updateSetting(actor, key, value);
    revalidatePath("/admin/settings");
    return { ok: true, message: "Saved." };
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, error: "Enter a valid list, e.g. [85, 100, 110]" };
    return toActionError(e);
  }
}

export async function resetDemoAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    if (s(f, "confirm") !== "RESET") return { ok: false, error: "Type RESET to confirm." };
    await resetDemoData(actor);
    revalidatePath("/", "layout");
    return { ok: true, message: "Demo data reloaded. You may need to sign in again." };
  } catch (e) {
    return toActionError(e);
  }
}
