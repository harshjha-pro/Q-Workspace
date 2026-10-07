import Link from "next/link";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { getArticle, complianceTypeOptions } from "@/server/services/knowledge/service";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArticleDialog } from "../article-form";
import { LinkDialog, LinkExtensionDialog, UnlinkButton } from "../link-form";
import { updateArticleAction } from "../actions";
import { KIND_LABELS, KIND_TONE, SERVICE_LINE_LABELS } from "../labels";

export const metadata = { title: "Knowledge article" };

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  const a = await load(() => getArticle(actor, id));
  const canWrite = can(actor, "knowledge.write");
  const canLink = canWrite || can(actor, "dueDateMaster.manage");
  const [types, extensions] = canLink
    ? await Promise.all([
      complianceTypeOptions(),
      db().extension.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 50 }).then((rows) => rows.map((x) => ({ id: x.id, name: `To ${formatDate(x.newEffectiveDueDate)} — ${x.reason}${x.notificationRef ? ` (${x.notificationRef})` : ""}` }))),
    ])
    : [[], []];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={a.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/knowledge" className="underline">Knowledge base</Link>
            <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{KIND_LABELS[a.kind] ?? a.kind}</Badge>
            {a.serviceLine ? <Badge>{SERVICE_LINE_LABELS[a.serviceLine] ?? a.serviceLine}</Badge> : null}
            {!a.publishedAt ? <Badge tone="amber">Draft</Badge> : null}
          </span>
        }
        actions={canWrite ? (
          <ArticleDialog action={updateArticleAction.bind(null, a.id)} trigger="Edit" title="Edit article"
            values={{ title: a.title, body: a.body, kind: a.kind, serviceLine: a.serviceLine ?? "", sourceRef: a.sourceRef, tags: a.tags.join(", "), published: !!a.publishedAt }} />
        ) : null}
      />
      <Card>
        <CardContent className="space-y-3">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{a.body}</div>
          {a.sourceRef ? <p className="text-xs text-muted">Source: {a.sourceRef}</p> : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-muted">
            <span>{a.publishedAt ? `Published ${formatDateTime(a.publishedAt)}` : "Not published"}{a.createdByName ? ` by ${a.createdByName}` : ""}</span>
            {a.updatedByName && a.updatedAt.getTime() - a.createdAt.getTime() > 60_000 ? <span>Updated {formatDateTime(a.updatedAt)} by {a.updatedByName}</span> : null}
            <span>Read by {a.readBy} {a.readBy === 1 ? "person" : "people"}{a.readByMe ? " (including you)" : ""}</span>
            {a.tags.map((t) => <Link key={t} href={`/knowledge?tag=${encodeURIComponent(t)}`} className="hover:underline">#{t}</Link>)}
          </div>
          <p className="text-xs text-muted">To record reading time, add a work entry under <b>Knowledge Updates</b> and pick this article.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Linked in the due-date master ({a.links.length})</CardTitle>
          {canLink ? <span className="flex flex-wrap gap-2"><LinkDialog articleId={a.id} types={types} /><LinkExtensionDialog articleId={a.id} extensions={extensions} /></span> : null}
        </CardHeader>
        <CardContent>
          {a.links.length === 0 ? <p className="text-sm text-muted">Not linked to any compliance type or extension.</p> : (
            <ul className="divide-y divide-line">
              {a.links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span><Badge tone={l.entityType === "COMPLIANCE_TYPE" ? "blue" : "amber"}>{l.entityType === "COMPLIANCE_TYPE" ? "Type" : l.entityType === "EXTENSION" ? "Extension" : "Rule"}</Badge> {l.label}</span>
                  {canLink ? <UnlinkButton articleId={a.id} linkId={l.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
