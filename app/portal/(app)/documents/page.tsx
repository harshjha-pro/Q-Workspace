import { requirePortal } from "@/server/context";
import { portalDocuments } from "@/server/services/portal/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const actor = await requirePortal();
  const docs = await portalDocuments(actor);
  const multi = actor.clientIds.length > 1;
  return (
    <div className="space-y-4">
      <PageHeader title="Documents" subtitle="Documents the firm shared with you, and the files you sent." />
      <Card>
        <Table>
          <THead><tr><TH>Document</TH>{multi ? <TH>Entity</TH> : null}<TH>Updated</TH><TH /></tr></THead>
          <TBody>
            {docs.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No documents yet.</TD></TR> : null}
            {docs.map((d) => (
              <TR key={d.id}>
                <TD>{d.name} {d.fromYou ? <Badge>Sent by you</Badge> : null}</TD>{multi ? <TD>{d.clientName}</TD> : null}
                <TD className="text-sm">{formatDateTime(d.updatedAt)}</TD>
                <TD><a className="text-sm underline" href={`/api/dms/${d.id}`}>Download</a></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
