import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { listDue, dueCounts } from "@/server/services/reminders/due-lists";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SendBox } from "./ui";
import { markSentAction, skipAction } from "./actions";

export const metadata = { title: "Reminders due" };

type Kind = "CLIENT_DOCS" | "PAYMENT";
type Status = "DUE" | "SENT" | "SKIPPED";

/** Reminder-due lists (P4-03, P4-08): copy the text, send it yourself, mark as sent. */
export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const actor = await requireStaff();
  const canDocs = can(actor, "task.work");
  const canPay = can(actor, "billing.view");
  if (!canDocs && !canPay) redirect("/denied");
  const sp = await searchParams;
  const kind: Kind = sp.kind === "PAYMENT" && canPay ? "PAYMENT" : canDocs ? "CLIENT_DOCS" : "PAYMENT";
  const status: Status = sp.status === "SENT" || sp.status === "SKIPPED" ? sp.status : "DUE";
  const [rows, counts] = await Promise.all([listDue(actor, { kind, status }), dueCounts(actor)]);
  const canRecordPayment = can(actor, "billing.receipt.record");
  const tab = (k: Kind, label: string, n: number) => <Link href={`/reminders?kind=${k}`} className={`rounded-md px-3 py-1 ${k === kind ? "bg-brand text-white" : "border border-line bg-white"}`}>{label}{n ? ` (${n})` : ""}</Link>;
  return (
    <div className="space-y-4">
      <PageHeader title="Reminders due" subtitle="Built each morning. The system sends nothing: copy the text, send it by WhatsApp, email or call, then mark it as sent. Sent reminders also appear in the client's portal." actions={can(actor, "settings.manage") ? <Link className="text-sm underline" href="/reminders/schedules">Schedules</Link> : null} />
      <nav className="flex flex-wrap gap-2 text-sm">
        {canDocs ? tab("CLIENT_DOCS", "Client documents", counts.docs) : null}
        {canPay ? tab("PAYMENT", "Payments", counts.payments) : null}
        <span className="mx-2 text-line">|</span>
        {(["DUE", "SENT", "SKIPPED"] as const).map((st) => <Link key={st} href={`/reminders?kind=${kind}&status=${st}`} className={st === status ? "font-medium underline" : "text-muted"}>{st === "DUE" ? "Due" : st === "SENT" ? "Sent" : "Skipped"}</Link>)}
      </nav>
      {rows.length === 0 ? <Card className="p-4 text-sm text-muted">{status === "DUE" ? "Nothing due. Well done." : "Nothing here."}</Card> : null}
      {rows.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle>
              <Link className="hover:underline" href={`/clients/${r.clientId}`}>{r.clientName}</Link>
              <span className="font-normal text-muted"> · {r.taskId ? <Link className="hover:underline" href={`/tasks/${r.taskId}`}>{r.about}</Link> : r.invoiceId ? <Link className="hover:underline" href={`/billing/invoices/${r.invoiceId}`}>{r.about}</Link> : r.about}</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1">
              {r.balancePaise !== null ? <Badge>{formatInr(r.balancePaise)} due</Badge> : null}
              <Badge tone={r.sequenceNo > 1 ? "amber" : "neutral"}>Reminder {r.sequenceNo}</Badge>
              {r.escalate ? <Badge tone="red">{r.kind === "PAYMENT" ? "Partner to follow up" : "Escalate: call the client"}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted">Due {formatDate(r.dueOn)}{r.scheduleName ? ` · ${r.scheduleName}` : ""}{r.sentAt ? ` · sent ${formatDateTime(r.sentAt)} by ${r.sentBy} (${r.channel.toLowerCase()})` : ""}</p>
            {r.status === "DUE"
              ? <SendBox text={r.messageText} channel={r.channel} markSent={markSentAction.bind(null, r.id)} skip={skipAction.bind(null, r.id)} readOnly={r.kind === "PAYMENT" && !canRecordPayment} />
              : <pre className="whitespace-pre-wrap rounded border border-line bg-gray-50 p-2 font-mono text-xs">{r.messageText}</pre>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
