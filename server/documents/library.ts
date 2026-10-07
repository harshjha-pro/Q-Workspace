import { db } from "../lib/db";
import { mergeDataFor, renderMerge } from "./merge";

/**
 * The approved body of a firm template (spec 13.3), or the caller's built-in default when the firm has
 * not approved one yet. Engagement letters, proposals, HR letters and notice replies all come through here.
 */
export async function approvedTemplateBody(code: string, fallback: string): Promise<{ body: string; templateVersionId: string | null }> {
  const v = await db().templateVersion.findFirst({ where: { template: { code, active: true }, status: "APPROVED" }, orderBy: { version: "desc" } });
  return v ? { body: v.body, templateVersionId: v.id } : { body: fallback, templateVersionId: null };
}

/** Merge a template for a client / engagement / employee. Callers check permissions first. */
export async function renderTemplateFor(code: string, fallback: string, ctx: Parameters<typeof mergeDataFor>[0]) {
  const t = await approvedTemplateBody(code, fallback);
  const r = renderMerge(t.body, await mergeDataFor(ctx));
  return { ...r, templateVersionId: t.templateVersionId };
}
