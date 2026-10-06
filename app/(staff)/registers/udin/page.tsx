import { requireStaff } from "@/server/context";
import { listUdins } from "@/server/services/registers/udin";
import { requireCap } from "@/lib/page";
import { diffDays, formatDate, toIstDate, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { RecordUdinDialog, GeneratedTable, type GeneratedRow } from "./udin-ui";

export const metadata = { title: "UDIN register" };

export default async function UdinPage() {
  const actor = await requireStaff();
  requireCap(actor, "udin.record");
  const rows = await listUdins(actor);
  const today = todayIst();
  const awaiting = rows.filter((r) => r.status === "AWAITING").sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.signingDate.localeCompare(b.signingDate));
  const generated: GeneratedRow[] = rows.filter((r) => r.status === "GENERATED").map((r) => ({
    id: r.id, client: r.clientName, doc: r.documentType, signed: r.signingDate, partner: r.partnerName, udin: r.udin ?? "", generatedOn: r.generatedOn ?? "",
    reconciledOn: r.reconciledAt ? toIstDate(r.reconciledAt) : "",
  }));
  const revoked = rows.filter((r) => r.status === "REVOKED");

  return (
    <div className="space-y-4">
      <PageHeader title="UDIN register" subtitle="Every signed attest or certificate needs a UDIN from the ICAI / ICSI portal. Record it here once generated." />
      <Card>
        <CardHeader><CardTitle>Awaiting UDIN ({awaiting.length})</CardTitle><span className="text-xs text-muted">Overdue rows have waited longer than the firm&apos;s limit since signing.</span></CardHeader>
        <Table>
          <THead><tr><TH>Client</TH><TH>Document</TH><TH>Signed</TH><TH>Partner</TH><TH>Waiting</TH><TH /></tr></THead>
          <TBody>
            {awaiting.length === 0 ? <TR><TD colSpan={6} className="text-muted">Nothing awaiting a UDIN.</TD></TR> : null}
            {awaiting.map((r) => (
              <TR key={r.id} className={r.overdue ? "bg-red-50/60" : undefined}>
                <TD>{r.clientName}</TD>
                <TD>{r.documentType}</TD>
                <TD className="whitespace-nowrap">{formatDate(r.signingDate)}</TD>
                <TD>{r.partnerName}</TD>
                <TD>{r.overdue ? <Badge tone="red">Overdue · {diffDays(r.signingDate, today)} days</Badge> : <span className="text-muted">{diffDays(r.signingDate, today)} days</span>}</TD>
                <TD><RecordUdinDialog id={r.id} doc={r.documentType} signed={r.signingDate} today={today} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Generated ({generated.length})</CardTitle></CardHeader>
        <GeneratedTable rows={generated} />
      </Card>
      {revoked.length ? (
        <Card>
          <details>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Revoked ({revoked.length})</summary>
            <Table>
              <THead><tr><TH>Client</TH><TH>Document</TH><TH>Signed</TH><TH>UDIN</TH></tr></THead>
              <TBody>
                {revoked.map((r) => (
                  <TR key={r.id}><TD>{r.clientName}</TD><TD>{r.documentType}</TD><TD>{formatDate(r.signingDate)}</TD><TD className="font-mono">{r.udin ?? "—"}</TD></TR>
                ))}
              </TBody>
            </Table>
          </details>
        </Card>
      ) : null}
    </div>
  );
}
