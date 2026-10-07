import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load, requireCap } from "@/lib/page";
import { listTemplates, CATEGORY_LABELS, TEMPLATE_CATEGORIES } from "@/server/services/doc-templates/service";
import { PageHeader, Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { NewTemplateDialog } from "./templates-ui";

export const metadata = { title: "Document templates" };

const STATUS_TONE: Record<string, "green" | "amber" | "neutral"> = { APPROVED: "green", DRAFT: "amber", RETIRED: "neutral" };

export default async function DocTemplatesPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "templates.manage");
  const sp = await searchParams;
  const rows = await load(() => listTemplates(actor, { category: sp.category || undefined, q: sp.q }));
  const hrOnly = actor.role === "HR_ADMIN";
  const categories = (hrOnly ? ["HR_LETTER"] : [...TEMPLATE_CATEGORIES]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }));
  const groups = [...new Set(rows.map((r) => r.category))];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Document templates"
        subtitle="Resolutions, notices, minutes, certificates, engagement and representation letters, notice replies, HR letters. Only Partner-approved versions are used to generate documents."
        actions={<NewTemplateDialog categories={categories} />}
      />
      {!hrOnly ? (
        <form method="get" className="flex flex-wrap gap-2">
          <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category" className="w-56"><option value="">All categories</option>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
          <Input name="q" defaultValue={sp.q} placeholder="Name or code" aria-label="Search templates" className="w-56" />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      ) : null}
      {rows.length === 0 ? <EmptyState title="No templates">Create one, or run setup to load the firm&apos;s default drafts.</EmptyState> : groups.map((g) => (
        <Card key={g}>
          <CardHeader><CardTitle>{CATEGORY_LABELS[g] ?? g}</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Template</TH><TH className="hidden sm:table-cell">Code</TH><TH>Latest</TH><TH className="hidden md:table-cell">In use</TH></tr></THead>
            <TBody>
              {rows.filter((r) => r.category === g).map((t) => (
                <TR key={t.id}>
                  <TD><Link href={`/admin/doc-templates/${t.id}`} className="font-medium text-brand hover:underline">{t.name}</Link>{!t.active ? <Badge className="ml-2">inactive</Badge> : null}<div className="font-mono text-xs text-muted sm:hidden">{t.code}</div></TD>
                  <TD className="hidden font-mono text-xs sm:table-cell">{t.code}</TD>
                  <TD>{t.latest ? <Badge tone={STATUS_TONE[t.latest.status]}>v{t.latest.version} {t.latest.status.toLowerCase()}</Badge> : "—"}</TD>
                  <TD className="hidden md:table-cell">{t.approvedVersion ? `v${t.approvedVersion}` : <span className="text-xs text-muted">none approved</span>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
