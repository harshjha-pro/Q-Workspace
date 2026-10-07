import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { getMeeting, meetingFormOptions } from "@/server/services/meetings/service";
import { formatDate, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { TASK_STATUS_TONE } from "@/components/status";
import { MEETING_STATUS_LABELS, MEETING_STATUS_TONE } from "../labels";
import { ActionItemDialog, EditMeetingDialog, MinutesForm, StatusButton } from "./meeting-ui";

export const metadata = { title: "Client meeting" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "meetings.manage");
  const m = await load(() => getMeeting(actor, id));
  const opts = await load(() => meetingFormOptions(actor));
  const today = todayIst();
  const cancelled = m.status === "CANCELLED";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={m.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/meetings?clientId=${m.client.id}`} className="underline">{m.client.name}</Link>
            <span>{formatDate(m.scheduledAt.slice(0, 10))} at {m.scheduledAt.slice(11)} IST · {m.durationMinutes} min</span>
            <Badge tone={MEETING_STATUS_TONE[m.status] ?? "neutral"}>{MEETING_STATUS_LABELS[m.status] ?? m.status}</Badge>
          </span>
        }
        actions={
          <span className="flex flex-wrap gap-2">
            <a href={`/meetings/${m.id}/ics`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Add to calendar (.ics)</a>
            {!cancelled ? <EditMeetingDialog id={m.id} v={{ title: m.title, date: m.scheduledAt.slice(0, 10), time: m.scheduledAt.slice(11), durationMinutes: m.durationMinutes, location: m.location, agenda: m.agenda }} /> : null}
            {m.status === "SCHEDULED" ? <StatusButton id={m.id} to="CANCELLED" label="Cancel meeting" confirm="Cancel this meeting?" /> : null}
            {cancelled ? <StatusButton id={m.id} to="SCHEDULED" label="Restore" /> : null}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted">Organiser:</span> {m.organizerName}</p>
            {m.location ? <p><span className="text-muted">Location:</span> {m.location}</p> : null}
            {m.engagement ? <p><span className="text-muted">Engagement:</span> <Link href={`/engagements/${m.engagement.id}`} className="text-brand hover:underline">{m.engagement.name} ({m.engagement.code})</Link></p> : null}
            <div>
              <p className="text-muted">Agenda</p>
              <p className="whitespace-pre-wrap">{m.agenda || "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Attendees ({m.people.length + m.contacts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><p className="text-muted">Our team</p><p>{m.people.map((p) => p.name).join(", ") || "—"}</p></div>
            <div><p className="text-muted">Client</p><ul>{m.contacts.length ? m.contacts.map((c) => <li key={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</li>) : <li>—</li>}</ul></div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Minutes</CardTitle></CardHeader>
        <CardContent>{cancelled ? <p className="whitespace-pre-wrap text-sm">{m.notes || "Meeting cancelled."}</p> : <MinutesForm id={m.id} notes={m.notes} held={m.status === "HELD"} />}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Action items ({m.actionItems.length})</CardTitle>
          {!cancelled ? <ActionItemDialog id={m.id} people={opts.people} today={today} /> : null}
        </CardHeader>
        <Table>
          <THead><tr><TH>Action</TH><TH>Owner</TH><TH>Due</TH><TH>Task</TH></tr></THead>
          <TBody>
            {m.actionItems.length === 0 ? <TR><TD colSpan={4} className="text-muted">No action items yet. Each one becomes a task with its owner and due date.</TD></TR> : null}
            {m.actionItems.map((a) => (
              <TR key={a.id}>
                <TD>{a.title}</TD>
                <TD>{a.ownerName}</TD>
                <TD className={a.dueDate && a.dueDate < today && a.taskStatus && !["FILED", "FILED_LATE", "NOT_APPLICABLE"].includes(a.taskStatus) ? "whitespace-nowrap font-medium text-red-700" : "whitespace-nowrap"}>{formatDate(a.dueDate)}</TD>
                <TD>{a.taskId ? <Link href={`/tasks/${a.taskId}`} className="hover:underline"><Badge tone={TASK_STATUS_TONE[a.taskStatus ?? ""] ?? "neutral"}>{(a.taskStatus ?? "task").replace(/_/g, " ").toLowerCase()}</Badge></Link> : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
