import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listDscs } from "@/server/services/registers/dsc";
import { can } from "@/server/permissions/guards";
import { requireCap } from "@/lib/page";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { clientOptions, peopleOptions, userNames } from "../_lib/pickers";
import { CUSTODY_LABELS, DSC_TYPE_LABELS, HOLDER_TYPE_LABELS, expiryBadge } from "./labels";
import { DscFormDialog, MoveDialog } from "./dsc-dialogs";

export const metadata = { title: "DSC register" };

export default async function DscPage({ searchParams }: { searchParams: Promise<{ expiring?: string; clientId?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "dsc.view");
  const sp = await searchParams;
  const expiring = sp.expiring === "1";
  const rows = await listDscs(actor, { expiring, clientId: sp.clientId || undefined });
  const canManage = can(actor, "dsc.manage");
  const canMove = can(actor, "dsc.movement.record");
  const [custodians, clients, people] = await Promise.all([
    userNames(rows.map((r) => r.custodianUserId)),
    canManage ? clientOptions(actor, "dsc.manage") : Promise.resolve([]),
    canManage || canMove ? peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN"]) : Promise.resolve([]),
  ]);
  const toggle = expiring ? "/registers/dsc" : "/registers/dsc?expiring=1";

  return (
    <div className="space-y-4">
      <PageHeader
        title="DSC register"
        subtitle="Digital signature tokens: who holds them, where they are, and when they expire."
        actions={canManage ? <DscFormDialog clients={clients} people={people} /> : null}
      />
      <Alert tone="warn"><strong>Never store a DSC PIN here.</strong> The register records the token and its custody only.</Alert>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={toggle} className={buttonVariants({ size: "sm", variant: expiring ? "default" : "secondary" })}>{expiring ? "Showing expiring only" : "Show expiring only"}</Link>
        <span className="text-muted">{rows.length} token{rows.length === 1 ? "" : "s"}</span>
      </div>
      <Card>
        <Table>
          <THead><tr><TH>Holder</TH><TH>Clients</TH><TH>Expiry</TH><TH>Custody</TH><TH /></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={5} className="py-6 text-center text-muted">{expiring ? "Nothing expiring in the next 30 days." : "No DSCs recorded."}</TD></TR> : null}
            {rows.map((r) => {
              const b = expiryBadge(r.state, r.days);
              const linked = r.clients.map((c, i) => ({ id: c.clientId, name: r.clientNames[i] ?? "" }));
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/registers/dsc/${r.id}`} className="font-medium text-brand hover:underline">{r.holderName}</Link>
                    <div className="text-xs text-muted">{HOLDER_TYPE_LABELS[r.holderType] ?? r.holderType} · {DSC_TYPE_LABELS[r.dscType] ?? r.dscType}{r.tokenSerial ? ` · ${r.tokenSerial}` : ""}</div>
                  </TD>
                  <TD className="max-w-60">{r.clientNames.join(", ")}</TD>
                  <TD>
                    <div>{formatDate(r.expiryDate)}</div>
                    <Badge tone={b.tone}>{b.text}</Badge>
                  </TD>
                  <TD>
                    <div>{CUSTODY_LABELS[r.custody] ?? r.custody}{r.custody === "STAFF" && r.custodianUserId ? `: ${custodians.get(r.custodianUserId) ?? ""}` : ""}</div>
                    {r.location ? <div className="text-xs text-muted">{r.location}</div> : null}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1">
                      {canMove ? <MoveDialog dscId={r.id} holder={r.holderName} people={people} linkedClients={linked} /> : null}
                      {canManage ? (
                        <DscFormDialog clients={clients} people={people} current={{
                          id: r.id, holderName: r.holderName, holderType: r.holderType, dscClass: r.dscClass, dscType: r.dscType, issuer: r.issuer,
                          tokenSerial: r.tokenSerial, issueDate: r.issueDate ?? "", expiryDate: r.expiryDate, notes: r.notes, clientIds: r.clients.map((c) => c.clientId),
                        }} />
                      ) : null}
                      <Link href={`/registers/dsc/${r.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>History</Link>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
