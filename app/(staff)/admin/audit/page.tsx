import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { searchAudit } from "@/server/services/audit/search";
import { PageHeader, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTime } from "@/server/lib/dates";

export const metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "audit.search");
  const sp = await searchParams;
  const rows = await searchAudit(actor, sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-3">
      <PageHeader title="Audit trail" subtitle="Every create, change, sign-in, import and backup — who, when, before and after. Append-only."
        actions={<Link className={buttonVariants({ variant: "secondary" })} href={`/api/audit/export?${qs}`}>Export CSV</Link>} />
      <form className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="from">From</Label><Input id="from" type="date" name="from" defaultValue={sp.from} /></div>
        <div><Label htmlFor="to">To</Label><Input id="to" type="date" name="to" defaultValue={sp.to} /></div>
        <div><Label htmlFor="q">Text</Label><Input id="q" name="q" defaultValue={sp.q} placeholder="e.g. Client, FLAGS, GSTIN" /></div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Card>
        <Table>
          <THead><tr><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Record</TH><TH>Change</TH></tr></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(r.at)}</TD>
                <TD>{r.actorName}</TD>
                <TD>{r.action.toLowerCase()}</TD>
                <TD className="text-xs">{r.entityType}<br /><span className="font-mono text-muted">{r.entityId.slice(0, 12)}</span></TD>
                <TD className="max-w-md text-xs">
                  {r.reason ? <p className="font-medium">{r.reason}</p> : null}
                  {r.afterJson ? <p className="break-all font-mono text-muted">{r.afterJson.slice(0, 240)}</p> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <p className="text-xs text-muted">Showing the latest {rows.length} entries for your filters.</p>
    </div>
  );
}
