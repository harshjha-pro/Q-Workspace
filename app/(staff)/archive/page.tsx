import Link from "next/link";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { requireCap, load } from "@/lib/page";
import { listArchive } from "@/server/services/lifecycle/archive";
import { formatDateTime } from "@/server/lib/dates";
import { SERVICE_LINES } from "@/server/domain/enums";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SERVICE_LINE_LABELS } from "../knowledge/labels";

export const metadata = { title: "Archive" };

/** Archive (spec 7.2): closed engagements, read-only and searchable. */
export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ q?: string; sl?: string; year?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "engagement.view");
  const sp = await searchParams;
  const rows = await load(() => listArchive(actor, { q: sp.q, serviceLine: sp.sl, year: sp.year }));
  const thisYear = new Date().getFullYear();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Archive"
        subtitle="Closed engagements are read-only. Open one for its completion report."
        actions={can(actor, "settings.manage") ? <Link href="/admin/retention" className={buttonVariants({ size: "sm", variant: "secondary" })}>Retention rules</Link> : null}
      />
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Engagement, code, client" aria-label="Search" />
        <Select name="sl" defaultValue={sp.sl ?? ""} aria-label="Service line">
          <option value="">All service lines</option>
          {SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABELS[s] ?? s}</option>)}
        </Select>
        <Select name="year" defaultValue={sp.year ?? ""} aria-label="Year archived">
          <option value="">Any year</option>
          {Array.from({ length: 8 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState title="Nothing archived yet">Engagements appear here once they are closed.</EmptyState> : (
          <Table>
            <THead><tr><TH>Engagement</TH><TH>Client</TH><TH>Service line</TH><TH>Partner / Manager</TH><TH>Archived</TH></tr></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/archive/${r.id}`} className="text-brand hover:underline">{r.name}</Link> <span className="font-mono text-xs text-muted">{r.code}</span>{r.recurrence === "RECURRING" ? <> <Badge>Recurring</Badge></> : null}</TD>
                  <TD>{r.client.name}</TD>
                  <TD>{SERVICE_LINE_LABELS[r.serviceLine] ?? r.serviceLine}</TD>
                  <TD className="text-sm">{[r.partnerName, r.managerName].filter(Boolean).join(" / ") || "—"}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(r.archivedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
