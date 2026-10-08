import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { formatDate } from "../../lib/dates";
import { generateFromTemplate } from "../doc-templates/service";
import { loadNotice } from "./notices";

/**
 * Template-based draft replies to notices (P4-06 →, D-85). The firm's approved NOTICE_REPLY template for the
 * authority is merged with what the register already knows (reference, dates, period, section, what the notice
 * asks); staff write the submissions and enclosures. The result is a Word draft filed with the notice's task,
 * marked confidential (NOTICE). No legal wording is generated: submissions are the user's own.
 */

const REPLY_FIELDS = ["officerDesignation", "officeAddress", "noticeReference", "noticeDate", "period", "matterRequested", "submissions", "enclosures"] as const;

export async function noticeReplyContext(actor: Actor, noticeId: string) {
  const n = await loadNotice(actor, noticeId, "notice.manage");
  const templates = await db().template.findMany({
    where: { category: "NOTICE_REPLY", active: true },
    include: { versions: { where: { status: "APPROVED" }, select: { id: true }, take: 1 } },
    orderBy: { name: "asc" },
  });
  const preferred = `NOTICE_REPLY_${n.authority}`;
  const docs = n.taskId ? await db().document.findMany({ where: { taskId: n.taskId, archivedAt: null, kind: { not: "NOTICE_REPLY" } }, select: { name: true }, orderBy: { createdAt: "asc" }, take: 20 }) : [];
  const matter = n.summary.trim() || [n.noticeType, n.section ? `u/s ${n.section}` : ""].filter(Boolean).join(" ");
  return {
    templates: templates.map((t) => ({ code: t.code, name: t.name, approved: t.versions.length > 0 })),
    defaultCode: templates.find((t) => t.code === preferred && t.versions.length)?.code ?? templates.find((t) => t.versions.length)?.code ?? null,
    prefill: {
      officerDesignation: "", officeAddress: "",
      noticeReference: [n.referenceNo, n.section ? `u/s ${n.section}` : ""].filter(Boolean).join(" "),
      noticeDate: n.noticeDate ? formatDate(n.noticeDate) : "",
      period: n.ayOrPeriod,
      matterRequested: matter,
      submissions: "",
      enclosures: docs.map((d, i) => `${i + 1}. ${d.name}`).join("\n"),
    } satisfies Record<(typeof REPLY_FIELDS)[number], string>,
  };
}

const draftInput = z.object({
  code: z.string().min(1, "Choose a template"),
  extra: z.object(Object.fromEntries(REPLY_FIELDS.map((f) => [f, z.string().max(20_000).default("")])) as Record<(typeof REPLY_FIELDS)[number], z.ZodDefault<z.ZodString>>),
});

export async function draftNoticeReply(actor: Actor, noticeId: string, input: z.input<typeof draftInput>) {
  const n = await loadNotice(actor, noticeId, "notice.manage");
  const d = parse(draftInput, input);
  const t = await db().template.findUnique({ where: { code: d.code } });
  if (!t || t.category !== "NOTICE_REPLY") throw new DomainError("VALIDATION", "Choose a notice-reply template.", { code: "Not a reply template" });
  if (!d.extra.submissions.trim()) throw new DomainError("VALIDATION", "Write the submissions — the draft has no other content of substance.", { submissions: "Required" });
  if (n.status === "CLOSED") throw ruleViolation("This notice is closed.");
  const label = [n.section && `u-s ${n.section}`, n.ayOrPeriod].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "-");
  const out = await generateFromTemplate(actor, {
    code: d.code, clientId: n.clientId, engagementId: n.engagementId, taskId: n.taskId, format: "DOCX",
    fileName: `Draft reply${label ? ` ${label}` : ""}`, extra: d.extra, tags: "draft,notice-reply", confidentiality: "NOTICE",
  });
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Notice", entityId: n.id, action: "DRAFT_REPLY", after: { template: d.code, documentId: out.documentId, missing: out.missing } }));
  return out;
}
