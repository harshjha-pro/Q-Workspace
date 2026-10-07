import Link from "next/link";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { load } from "@/lib/page";
import { listArticles, ARTICLE_KINDS } from "@/server/services/knowledge/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArticleDialog } from "./article-form";
import { createArticleAction } from "./actions";
import { KIND_LABELS, KIND_TONE, SERVICE_LINE_LABELS } from "./labels";

export const metadata = { title: "Knowledge base" };

/** Knowledge base (spec 13.4): circulars, notifications, extensions, SOPs and FAQs, searchable by service line. */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; sl?: string; tag?: string; drafts?: string }> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const canWrite = can(actor, "knowledge.write");
  const rows = await load(() => listArticles(actor, { q: sp.q, kind: sp.kind, serviceLine: sp.sl, tag: sp.tag, includeDrafts: sp.drafts === "1" }));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Knowledge base"
        subtitle="Firm notes on circulars, notifications and due-date extensions, internal SOPs and helpdesk FAQs. Always check the official source before relying on a statutory point."
        actions={canWrite ? <ArticleDialog action={createArticleAction} trigger="New article" title="New article" /> : null}
      />
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search title, text or tags" aria-label="Search" />
        <Select name="kind" defaultValue={sp.kind ?? ""} aria-label="Kind">
          <option value="">All kinds</option>
          {ARTICLE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </Select>
        <Select name="sl" defaultValue={sp.sl ?? ""} aria-label="Service line">
          <option value="">All service lines</option>
          {Object.entries(SERVICE_LINE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <div className="flex items-center gap-2">
          {canWrite ? <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="drafts" value="1" defaultChecked={sp.drafts === "1"} /> Drafts</label> : null}
          <Button type="submit" variant="secondary">Search</Button>
        </div>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState title="No articles found">Try a different search or filter.</EmptyState> : (
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li key={a.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{KIND_LABELS[a.kind] ?? a.kind}</Badge>
                  {a.serviceLine ? <Badge>{SERVICE_LINE_LABELS[a.serviceLine] ?? a.serviceLine}</Badge> : null}
                  {!a.publishedAt ? <Badge tone="amber">Draft</Badge> : null}
                  <Link href={`/knowledge/${a.id}`} className="font-medium text-brand hover:underline">{a.title}</Link>
                </div>
                <p className="line-clamp-2 text-sm text-muted">{a.body}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{a.publishedAt ? `Published ${formatDateTime(a.publishedAt)}` : `Created ${formatDateTime(a.createdAt)}`}</span>
                  {a.readBy ? <span>Read by {a.readBy} {a.readBy === 1 ? "person" : "people"}</span> : null}
                  {a.tags.map((t) => <Link key={t} href={`/knowledge?tag=${encodeURIComponent(t)}`} className="hover:underline">#{t}</Link>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
