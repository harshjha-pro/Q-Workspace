import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/context";
import { listDscs, movements } from "@/server/services/registers/dsc";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { clientNames, peopleOptions, userNames } from "../../_lib/pickers";
import { CUSTODY_LABELS, DSC_TYPE_LABELS, HOLDER_TYPE_LABELS, expiryBadge } from "../labels";
import { MoveDialog } from "../dsc-dialogs";

export const metadata = { title: "DSC" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

export default async function DscDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "dsc.view");
  // listDscs applies the client scope; a DSC outside it is treated as not found.
  const d = (await listDscs(actor)).find((r) => r.id === id);
  if (!d) notFound();
  const moves = await load(() => movements(actor, id));
  const canMove = can(actor, "dsc.movement.record");
  const [users, clients, people] = await Promise.all([
    userNames([...moves.flatMap((m) => [m.userId, m.createdById]), d.custodianUserId]),
    clientNames(moves.map((m) => m.clientId)),
    canMove ? peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN"]) : Promise.resolve([]),
  ]);
  const b = expiryBadge(d.state, d.days);
  const linked = d.clients.map((c, i) => ({ id: c.clientId, name: d.clientNames[i] ?? "" }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.holderName}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link href="/registers/dsc" className="underline">DSC register</Link><Badge tone={b.tone}>{b.text}</Badge></span>}
        actions={canMove ? <MoveDialog dscId={d.id} holder={d.holderName} people={people} linkedClients={linked} /> : null}
      />
      <Alert tone="warn">Never store a DSC PIN here.</Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Token</CardTitle></CardHeader>
          <CardContent>
            <Row label="Holder is" value={HOLDER_TYPE_LABELS[d.holderType] ?? d.holderType} />
            <Row label="Class / type" value={`${d.dscClass.replace(/_/g, " ").toLowerCase()} · ${DSC_TYPE_LABELS[d.dscType] ?? d.dscType}`} />
            <Row label="Issuer" value={d.issuer} />
            <Row label="Token serial" value={d.tokenSerial ? <span className="font-mono">{d.tokenSerial}</span> : ""} />
            <Row label="Issued" value={formatDate(d.issueDate)} />
            <Row label="Expires" value={formatDate(d.expiryDate)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Where it is now</CardTitle></CardHeader>
          <CardContent>
            <Row label="Custody" value={`${CUSTODY_LABELS[d.custody] ?? d.custody}${d.custodianUserId ? `: ${users.get(d.custodianUserId) ?? ""}` : ""}`} />
            <Row label="Location" value={d.location} />
            <Row label="Clients" value={d.clientNames.join(", ")} />
            <Row label="Notes" value={d.notes} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Movement history</CardTitle><span className="text-xs text-muted">Latest 100</span></CardHeader>
        <Table>
          <THead><tr><TH>When</TH><TH>From → to</TH><TH>Location</TH><TH>Person / client</TH><TH>Note</TH><TH>Recorded by</TH></tr></THead>
          <TBody>
            {moves.length === 0 ? <TR><TD colSpan={6} className="text-muted">No movements yet.</TD></TR> : null}
            {moves.map((m) => (
              <TR key={m.id}>
                <TD className="whitespace-nowrap">{formatDateTime(m.movedAt)}</TD>
                <TD>{CUSTODY_LABELS[m.fromCustody] ?? m.fromCustody} → {CUSTODY_LABELS[m.toCustody] ?? m.toCustody}</TD>
                <TD>{m.location}</TD>
                <TD>{[m.userId ? users.get(m.userId) : null, m.clientId ? clients.get(m.clientId) : null].filter(Boolean).join(" · ")}</TD>
                <TD>{m.note}</TD>
                <TD className="text-xs text-muted">{m.createdById ? users.get(m.createdById) : ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
