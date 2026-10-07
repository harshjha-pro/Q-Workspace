import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { can, scopeOf } from "@/server/permissions/guards";
import { clientWhere } from "@/server/permissions/scopes";
import { formatDate, monthLabel, todayIst } from "@/server/lib/dates";
import { attendanceSheet, listRegularisations } from "@/server/services/attendance/service";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, Alert } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ActionButton } from "../../work/action-button";
import { CheckInDialog, RegulariseDialog } from "./attendance-forms";
import { decideRegularisationAction } from "./actions";

export const metadata = { title: "Attendance" };

const KIND: Record<string, [string, BadgeTone]> = {
  PRESENT: ["Present", "green"], HALF_DAY: ["Half day (½ LOP)", "amber"], ABSENT: ["Absent (LOP)", "red"], LEAVE: ["Leave", "blue"],
  HOLIDAY: ["Holiday", "violet"], WEEK_OFF: ["Week off", "neutral"], UPCOMING: ["—", "neutral"], NOT_EMPLOYED: ["Not employed", "neutral"],
};
const LOC: Record<string, string> = { OFFICE: "Office", CLIENT_SITE: "Client site", WFH: "WFH" };

type Tab = "sheet" | "me" | "approvals";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; me?: string; tab?: string; user?: string }> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const today = todayIst();
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const hrScope = scopeOf(actor, "hr.records.view");
  const canSheet = !["none", "self"].includes(hrScope);
  const canApprove = can(actor, "attendance.regularise.approve");
  const tab: Tab = sp.tab === "approvals" && canApprove ? "approvals" : sp.me === "1" || !canSheet || sp.user ? "me" : "sheet";
  const tabs: [Tab, string, string][] = [
    ...(canSheet ? ([["sheet", "Monthly sheet", `/hr/attendance?month=${month}`]] as [Tab, string, string][]) : []),
    ["me", "My attendance", `/hr/attendance?me=1&month=${month}`],
    ...(canApprove ? ([["approvals", "Regularisations to approve", "/hr/attendance?tab=approvals"]] as [Tab, string, string][]) : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Attendance" subtitle="Derived from work entries, approved leave and holidays — no punch-in." actions={tab !== "approvals" ? (
        <form className="flex items-center gap-2" action="/hr/attendance">
          {tab === "me" ? <input type="hidden" name="me" value="1" /> : null}
          {sp.user ? <input type="hidden" name="user" value={sp.user} /> : null}
          <Input type="month" name="month" defaultValue={month} aria-label="Month" className="h-8 w-40" />
          <button className="h-8 rounded-md border border-line bg-white px-3 text-xs">Show</button>
        </form>
      ) : null} />
      {tabs.length > 1 ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Views">
          {tabs.map(([k, l, href]) => <Link key={k} href={href} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{l}</Link>)}
        </nav>
      ) : null}
      {tab === "sheet" ? <Sheet month={month} actor={actor} /> : tab === "approvals" ? <Approvals actor={actor} /> : <Mine actor={actor} month={month} today={today} userId={sp.user} />}
    </div>
  );
}

type A = Awaited<ReturnType<typeof requireStaff>>;

async function Sheet({ actor, month }: { actor: A; month: string }) {
  const rows = await load(() => attendanceSheet(actor, month));
  return (
    <Card>
      <CardHeader><CardTitle>{monthLabel(month)}{rows[0]?.locked ? <Badge className="ml-2">locked in payroll</Badge> : null}</CardTitle></CardHeader>
      <Table>
        <THead><tr><TH>Person</TH><TH className="text-right">Present</TH><TH className="text-right">Leave</TH><TH className="text-right">Holidays</TH><TH className="text-right">Week offs</TH><TH className="text-right">Absent (LOP)</TH><TH className="text-right">Days to come</TH></tr></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.userId}>
              <TD><Link href={`/hr/attendance?user=${r.userId}&month=${month}`} className="font-medium text-brand hover:underline">{r.name}</Link></TD>
              <TD className="text-right">{r.summary.present}</TD>
              <TD className="text-right">{r.summary.leave}</TD>
              <TD className="text-right">{r.summary.holidays}</TD>
              <TD className="text-right">{r.summary.weekOffs}</TD>
              <TD className={cn("text-right", r.summary.absent ? "font-medium text-red-700" : "")}>{r.summary.absent}</TD>
              <TD className="text-right text-muted">{r.summary.upcoming}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

async function Mine({ actor, month, today, userId }: { actor: A; month: string; today: string; userId?: string }) {
  const self = !userId || userId === actor.userId;
  const [row] = await load(() => attendanceSheet(actor, month, self ? { me: true } : { userId }));
  const regs = self ? await load(() => listRegularisations(actor, "mine")) : [];
  const clients = self ? await db().client.findMany({ where: { AND: [clientWhere(actor, scopeOf(actor, "client.view")), { status: "ACTIVE" }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }) : [];
  if (!row) return <EmptyState title="Nothing to show" />;
  const s = row.summary;
  return (
    <div className="space-y-4">
      {self ? <div className="flex flex-wrap gap-2"><CheckInDialog clients={clients} /><RegulariseDialog today={today} /></div> : <p className="text-sm font-medium">{row.name}</p>}
      {row.locked ? <Alert tone="info">This month is locked in an approved payroll run.</Alert> : null}
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {([["Present", s.present], ["Leave", s.leave], ["Holidays", s.holidays], ["Week offs", s.weekOffs], ["Absent (LOP)", s.absent], ["Days to come", s.upcoming]] as [string, number][]).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-white p-3"><dt className="text-xs text-muted">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
        ))}
      </dl>
      <Card>
        <Table>
          <THead><tr><TH>Date</TH><TH>Status</TH><TH>Where</TH><TH>Note</TH></tr></THead>
          <TBody>
            {row.days.map((d) => {
              const [label, tone] = KIND[d.kind] ?? [d.kind, "neutral" as BadgeTone];
              return (
                <TR key={d.date}>
                  <TD className="whitespace-nowrap">{formatDate(d.date)}</TD>
                  <TD><Badge tone={tone}>{label}</Badge>{d.leaveHalfDays === 1 && d.kind !== "HALF_DAY" ? <span className="ml-1 text-xs text-muted">½ leave</span> : null}</TD>
                  <TD>{d.location ? LOC[d.location] ?? d.location : ""}</TD>
                  <TD className="text-xs text-muted">{d.source === "REGULARISED" ? "Regularised" : d.source === "CHECK_IN" ? "Checked in" : d.source === "LEAVE_EXCESS" ? "Leave beyond balance" : ""}{d.note ? ` · ${d.note}` : ""}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      {regs.length ? (
        <Card>
          <CardHeader><CardTitle>My regularisation requests</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {regs.map((r) => <p key={r.id}>{formatDate(r.date)} · {r.reason} · <Badge tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}>{r.status.toLowerCase()}</Badge></p>)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function Approvals({ actor }: { actor: A }) {
  const rows = await load(() => listRegularisations(actor, "approvals"));
  if (rows.length === 0) return <EmptyState title="No regularisations waiting for you" />;
  const names = new Map((await db().user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return (
    <Card>
      <CardContent className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><span className="font-medium">{names.get(r.userId)}</span> · {formatDate(r.date)} · {LOC[r.requestedStatus === "PRESENT" ? "OFFICE" : r.requestedStatus] ?? r.requestedStatus}<span className="block text-xs text-muted">{r.reason}</span></span>
            <span className="flex gap-2">
              <ActionButton action={decideRegularisationAction.bind(null, r.id, true)} variant="default">Approve</ActionButton>
              <ActionButton action={decideRegularisationAction.bind(null, r.id, false)}>Reject</ActionButton>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
