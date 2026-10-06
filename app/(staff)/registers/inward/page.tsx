import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listInwardOutward } from "@/server/services/registers/inward";
import { requireCap } from "@/lib/page";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { clientNames, clientOptions, peopleOptions, userNames } from "../_lib/pickers";
import { RecordDialog, MoveDialog, ReturnDialog } from "./inward-ui";

export const metadata = { title: "Inward / outward" };

export default async function InwardPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "inwardOutward.manage");
  const sp = await searchParams;
  const openOnly = sp.all !== "1";
  const rows = await listInwardOutward(actor, { open: openOnly });
  const [clients, names, people, holders] = await Promise.all([
    clientOptions(actor, "inwardOutward.manage"),
    clientNames(rows.map((r) => r.clientId)),
    peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN"]),
    userNames(rows.flatMap((r) => [r.custodianUserId, r.handledById])),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inward / outward register"
        subtitle="Physical documents in the office: where each one is and who has it."
        actions={<RecordDialog clients={clients} people={people} today={todayIst()} />}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={openOnly ? "/registers/inward?all=1" : "/registers/inward"} className={buttonVariants({ size: "sm", variant: "secondary" })}>
          {openOnly ? "Show returned too" : "Show open only"}
        </Link>
        <span className="text-muted">{rows.length} {openOnly ? "open " : ""}entr{rows.length === 1 ? "y" : "ies"}</span>
      </div>
      <Card>
        <Table>
          <THead><tr><TH>Date</TH><TH>In/Out</TH><TH>Client</TH><TH>Document</TH><TH>Where</TH><TH>Handled by</TH><TH /></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={7} className="py-6 text-center text-muted">{openOnly ? "No documents currently held." : "Nothing recorded."}</TD></TR> : null}
            {rows.map((r) => (
              <TR key={r.id} className={r.returnedAt ? "opacity-60" : undefined}>
                <TD className="whitespace-nowrap">{formatDate(r.date)}</TD>
                <TD><Badge tone={r.direction === "IN" ? "blue" : "violet"}>{r.direction === "IN" ? "In" : "Out"}</Badge></TD>
                <TD><Link href={`/clients/${r.clientId}`} className="hover:underline">{names.get(r.clientId) ?? ""}</Link></TD>
                <TD className="max-w-72">
                  {r.documentDesc}
                  {r.notes ? <div className="text-xs text-muted">{r.notes}</div> : null}
                </TD>
                <TD>
                  {r.returnedAt ? <Badge tone="green">Returned {formatDateTime(r.returnedAt)}</Badge> : (
                    <>
                      <div>{r.currentLocation || "—"}</div>
                      {r.custodianUserId ? <div className="text-xs text-muted">with {holders.get(r.custodianUserId) ?? ""}</div> : null}
                    </>
                  )}
                </TD>
                <TD className="text-xs text-muted">{r.handledById ? holders.get(r.handledById) : ""}</TD>
                <TD>
                  {!r.returnedAt ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      <MoveDialog id={r.id} doc={r.documentDesc} location={r.currentLocation} custodianId={r.custodianUserId ?? ""} people={people} />
                      <ReturnDialog id={r.id} doc={r.documentDesc} />
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
