"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { createArticle, updateArticle, linkArticle, unlinkArticle, type ArticleKind, type LinkType } from "@/server/services/knowledge/service";
import { toActionError, type ActionResult } from "@/lib/action";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function input(f: FormData) {
  return {
    title: s(f, "title"), body: s(f, "body"), kind: s(f, "kind") as ArticleKind, serviceLine: s(f, "serviceLine") || null,
    sourceRef: s(f, "sourceRef"), tags: s(f, "tags"), publish: f.get("publish") === "on",
  };
}

export async function createArticleAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id: string;
  try {
    id = (await createArticle(actor, input(f))).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/knowledge/${id}`);
}

export async function updateArticleAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await updateArticle(actor, id, input(f));
    revalidatePath(`/knowledge/${id}`);
    return { ok: true, message: "Article saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function linkArticleAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await linkArticle(actor, id, (s(f, "entityType") || "COMPLIANCE_TYPE") as LinkType, s(f, "entityId"));
    revalidatePath(`/knowledge/${id}`);
    return { ok: true, message: "Linked." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unlinkArticleAction(articleId: string, linkId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await unlinkArticle(actor, linkId);
    revalidatePath(`/knowledge/${articleId}`);
    return { ok: true, message: "Link removed." };
  } catch (e) {
    return toActionError(e);
  }
}
