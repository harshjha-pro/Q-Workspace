import Link from "next/link";
import { requirePortal } from "@/server/context";
import { portalDashboard } from "@/server/services/portal/service";
import { portalFeedbackRequests } from "@/server/services/portal/actions";
import { portalReminders } from "@/server/services/reminders/due-lists";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FeedbackForm } from "../_ui/forms";
import { feedbackAction } from "./actions";
import { PlainStatus } from "./_status";

export const metadata = { title: "Client portal" };

function Tile({ href, label, value, alert }: { href: string; label: string; value: string | number; alert?: boolean }) {
  return (
    <Link href={href} className={`rounded-lg border bg-white p-4 shadow-sm hover:bg-gray-50 ${alert ? "border-amber-300" : "border-line"}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </Link>
  );
}

export default async function PortalHome() {
  const actor = await requirePortal();
  const [d, feedback, reminders] = await Promise.all([portalDashboard(actor), portalFeedbackRequests(actor), portalReminders(actor)]);
  const openReminders = reminders.filter((r) => r.open);
  return (
    <div className="space-y-4">
      <PageHeader title={`Hello, ${actor.displayName}`} subtitle="What the firm needs from you, and where your work stands." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile href="/portal/requests" label="Documents to send" value={d.toUpload} alert={d.toUpload > 0} />
        <Tile href="/portal/approvals" label="Waiting for your approval" value={d.toApprove} alert={d.toApprove > 0} />
        <Tile href="/portal/agreements" label="Proposals & letters to accept" value={d.toAccept} alert={d.toAccept > 0} />
        <Tile href="/portal/invoices" label={d.overdueInvoices ? `Outstanding (${d.overdueInvoices} overdue)` : "Outstanding"} value={formatInr(d.outstandingPaise)} alert={d.overdueInvoices > 0} />
        <Tile href="/portal/requests" label="Uploaded, being checked" value={d.beingChecked} />
      </div>
      {openReminders.length ? (
        <Card>
          <CardHeader><CardTitle>Reminders from the firm</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {openReminders.map((r) => (
                <li key={r.id} className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                  <div className="mb-1 text-xs text-muted">{formatDateTime(r.sentAt)} · {r.kind === "PAYMENT" ? <Link className="underline" href="/portal/invoices">Invoices</Link> : <Link className="underline" href="/portal/requests">Send documents</Link>}</div>
                  <p className="whitespace-pre-wrap">{r.text}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {feedback.map((f) => (
        <Card key={f.id}>
          <CardHeader><CardTitle>Your feedback on {f.engagement}</CardTitle></CardHeader>
          <CardContent><FeedbackForm action={feedbackAction.bind(null, f.id)} /></CardContent>
        </Card>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Coming up</CardTitle><Link className="text-sm underline" href="/portal/filings">All filings</Link></CardHeader>
          <CardContent>
            {d.dueSoon.length === 0 ? <p className="text-sm text-muted">Nothing due in the next 30 days.</p> : (
              <ul className="divide-y divide-line text-sm">
                {d.dueSoon.map((f) => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{f.title}{f.period ? ` · ${f.period}` : ""}{actor.clientIds.length > 1 ? <span className="text-muted"> · {f.clientName}</span> : null}</span><PlainStatus s={f.status} /></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recently filed</CardTitle></CardHeader>
          <CardContent>
            {d.recentlyFiled.length === 0 ? <p className="text-sm text-muted">No filings in the last year yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {d.recentlyFiled.map((f) => <li key={f.id} className="py-2"><div>{f.title}{f.period ? ` · ${f.period}` : ""}</div><div className="text-xs text-muted">Filed {formatDate(f.filedDate)}{f.acks[0] ? ` · ${f.acks[0].type} ${f.acks[0].number}` : ""}</div></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
