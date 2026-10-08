import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listThreads, messageableClients, responseStats } from "@/server/services/messages/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { NewThreadDialog } from "@/components/messages/forms";
import { startThreadAction } from "./actions";

export const metadata = { title: "Client messages" };

const TABS = [["waiting", "Waiting for reply"], ["open", "Open"], ["closed", "Closed"], ["all", "All"]] as const;
const waited = (since: Date) => {
  const h = Math.floor((Date.now() - since.getTime()) / 3600_000);
  return h < 1 ? "under an hour" : h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
};
const dur = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`);

/** Portal conversations (P4-04): what clients are waiting on first, with the firm's response times. */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "portal.share");
  const { status: raw } = await searchParams;
  const status = (TABS.find(([k]) => k === raw)?.[0] ?? "open") as (typeof TABS)[number][0];
  const [rows, clients, stats] = await Promise.all([listThreads(actor, { status }), messageableClients(actor), responseStats(actor)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Client messages" subtitle={`Replies in the last 90 days: ${stats.replies}, median ${dur(stats.medianMinutes)}, slowest ${dur(stats.slowestMinutes)}; ${stats.withinTarget} within the ${stats.targetHours} h target. Waiting now: ${stats.waitingNow}${stats.overdueNow ? ` (${stats.overdueNow} over target)` : ""}.`} actions={<NewThreadDialog action={startThreadAction} clients={clients} base="/messages" />} />
      <nav className="flex gap-2 text-sm">
        {TABS.map(([k, label]) => <Link key={k} href={`/messages?status=${k}`} className={`rounded-md px-3 py-1 ${k === status ? "bg-brand text-white" : "border border-line bg-white"}`}>{label}</Link>)}
      </nav>
      <Card>
        <Table>
          <THead><tr><TH>Conversation</TH><TH>Client</TH><TH>Last message</TH><TH>Status</TH></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No conversations here.</TD></TR> : null}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/messages/${r.id}`} className="font-medium hover:underline">{r.subject}</Link>{r.unread ? <Badge tone="blue" className="ml-2">{r.unread} new</Badge> : null}{r.engagementName ? <div className="text-xs text-muted">{r.engagementName}</div> : null}</TD>
                <TD className="text-sm">{r.clientName}</TD>
                <TD className="text-sm">{formatDateTime(r.lastMessageAt)}</TD>
                <TD>{r.closed ? <Badge>Closed</Badge> : r.waitingSince ? <Badge tone={r.overdue ? "red" : "amber"}>Client waiting {waited(r.waitingSince)}</Badge> : <Badge tone="green">Answered</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
