import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { exitCandidates, listExits, EXIT_LABELS, type ExitStatus } from "@/server/services/hr/exits";
import { canWrite } from "@/server/services/hr/common";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StartExitDialog } from "./ui";

export const metadata = { title: "Exits" };

export default async function ExitsPage() {
  const actor = await requireStaff();
  requireCap(actor, "exit.manage");
  const rows = await load(() => listExits(actor));
  const writer = canWrite(actor, "exit.manage");
  const people = writer ? (await exitCandidates(actor)).map((p) => ({ id: p.id, name: p.displayName })) : [];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Exits" subtitle="Resignation → notice → handover checklist → full and final → relieving and experience letters." actions={writer ? <StartExitDialog people={people} today={todayIst()} /> : null} />
      {rows.length === 0 ? <EmptyState title="No exits in progress" /> : (
        <Card>
          <Table>
            <THead><tr><TH>Person</TH><TH>Resigned</TH><TH>Last day</TH><TH>Checklist</TH><TH>Status</TH></tr></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/hr/exits/${r.id}`} className="font-medium text-brand hover:underline">{r.name}</Link></TD>
                  <TD>{formatDate(r.resignationDate)}</TD>
                  <TD>{formatDate(r.lastWorkingDate)}</TD>
                  <TD>{r.totalItems - r.openItems} / {r.totalItems} done</TD>
                  <TD><Badge tone={r.status === "CLOSED" ? "neutral" : "blue"}>{EXIT_LABELS[r.status as ExitStatus]}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
