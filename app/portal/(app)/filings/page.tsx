import { requirePortal } from "@/server/context";
import { portalFilings } from "@/server/services/portal/service";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PlainStatus } from "../_status";

export const metadata = { title: "Filings" };

export default async function FilingsPage() {
  const actor = await requirePortal();
  const f = await portalFilings(actor, { days: 90 });
  const multi = actor.clientIds.length > 1;
  return (
    <div className="space-y-4">
      <PageHeader title="Filings" subtitle="Returns and forms due in the next 90 days, and those filed in the last year." />
      <Card>
        <CardHeader><CardTitle>Coming up</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Filing</TH><TH>Period</TH>{multi ? <TH>Entity</TH> : null}<TH>Due</TH><TH>Status</TH></tr></THead>
          <TBody>
            {f.upcoming.length === 0 ? <TR><TD colSpan={5} className="text-sm text-muted">Nothing due.</TD></TR> : null}
            {f.upcoming.map((r) => <TR key={r.id}><TD>{r.title}</TD><TD>{r.period}</TD>{multi ? <TD>{r.clientName}</TD> : null}<TD>{formatDate(r.dueDate)}</TD><TD><PlainStatus s={r.status} /></TD></TR>)}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Filed</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Filing</TH><TH>Period</TH>{multi ? <TH>Entity</TH> : null}<TH>Filed on</TH><TH>Acknowledgment</TH></tr></THead>
          <TBody>
            {f.recent.length === 0 ? <TR><TD colSpan={5} className="text-sm text-muted">No filings in the last year yet.</TD></TR> : null}
            {f.recent.map((r) => (
              <TR key={r.id}>
                <TD>{r.title}</TD><TD>{r.period}</TD>{multi ? <TD>{r.clientName}</TD> : null}<TD>{formatDate(r.filedDate)}</TD>
                <TD className="text-sm">{r.acks.map((a) => <div key={a.number}>{a.type} {a.number}{a.documentId ? <> · <a className="underline" href={`/api/dms/${a.documentId}`}>download</a></> : null}</div>)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
