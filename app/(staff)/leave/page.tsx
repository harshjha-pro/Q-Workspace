import Link from "next/link";
import { requireStaff } from "@/server/context";
import type { StaffActor } from "@/server/permissions/actor";
import { requireCap, load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { can, scopeOf } from "@/server/permissions/guards";
import { userWhere } from "@/server/permissions/scopes";
import { formatDate, todayIst } from "@/server/lib/dates";
import { leaveBalances, leaveConflicts, listLeave, leaveBalanceWarningFor } from "@/server/services/leave/service";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ActionButton } from "../work/action-button";
import { ApplyLeaveDialog } from "./apply-dialog";
import { LeaveApproval, type Conflict } from "./approval-card";
import { cancelLeaveAction } from "./actions";
import { halfDaysLabel, LEAVE_REASON_LABELS, LEAVE_STATUS_TONE, LEAVE_TYPE_LABELS } from "./labels";

export const metadata = { title: "Leave" };

type Tab = "mine" | "approvals" | "team";
type LeaveRow = Awaited<ReturnType<typeof listLeave>>[number];

function dates(r: LeaveRow) {
  const from = `${formatDate(r.fromDate)}${r.halfDayStart ? " (½)" : ""}`;
  return r.fromDate === r.toDate ? from : `${from} to ${formatDate(r.toDate)}${r.halfDayEnd ? " (½)" : ""}`;
}

async function names(ids: string[]) {
  const rows = await db().user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true } });
  return new Map(rows.map((u) => [u.id, u.displayName]));
}

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "leave.apply");
  const canApprove = can(actor, "leave.approve");
  const asked = (await searchParams).tab;
  const tab: Tab = canApprove && (asked === "approvals" || asked === "team") ? asked : "mine";
  const today = todayIst();

  const tabs: [Tab, string][] = canApprove ? [["mine", "My leave"], ["approvals", "To approve"], ["team", "Team"]] : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Leave" subtitle="Apply, track and approve leave." actions={<ApplyLeaveDialog today={today} />} />
      {tabs.length ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Views">
          {tabs.map(([k, l]) => (
            <Link key={k} href={k === "mine" ? "/leave" : `/leave?tab=${k}`} aria-current={tab === k ? "page" : undefined}
              className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{l}</Link>
          ))}
        </nav>
      ) : null}
      {tab === "mine" ? <MyLeave actor={actor} today={today} /> : tab === "approvals" ? <Approvals actor={actor} /> : <Team actor={actor} today={today} />}
    </div>
  );
}

async function MyLeave({ actor, today }: { actor: StaffActor; today: string }) {
  const [rows, balances] = await Promise.all([load(() => listLeave(actor, "mine")), load(() => leaveBalances(actor))]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Balance · {balances.fy}</CardTitle></CardHeader>
        <CardContent>
          {balances.rows.length === 0 ? (
            <p className="text-sm text-muted">No balances set up for this year yet. HR adds them.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {balances.rows.map((b) => (
                <div key={b.id}>
                  <dt className="text-xs text-muted">{LEAVE_TYPE_LABELS[b.leaveType] ?? b.leaveType}</dt>
                  <dd className="text-lg font-semibold">{halfDaysLabel(Math.max(0, b.availableHalfDays))}</dd>
                  <dd className="text-xs text-muted">{halfDaysLabel(b.takenHalfDays)} taken</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
      {rows.length === 0 ? (
        <EmptyState title="No leave applied yet" />
      ) : (
        <Card>
          <Table>
            <THead><tr><TH>Dates</TH><TH>Type</TH><TH>Days</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>{dates(r)}{r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}</TD>
                  <TD>{LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType}<span className="block text-xs text-muted">{LEAVE_REASON_LABELS[r.reason] ?? r.reason}</span></TD>
                  <TD className="whitespace-nowrap">{halfDaysLabel(r.halfDays)}</TD>
                  <TD>
                    <Badge tone={LEAVE_STATUS_TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge>
                    {r.decisionNote ? <span className="block text-xs text-muted">{r.decisionNote}</span> : null}
                  </TD>
                  <TD className="text-right">
                    {r.status === "PENDING" || (r.status === "APPROVED" && r.fromDate > today) ? (
                      <ActionButton action={cancelLeaveAction.bind(null, r.id)} confirm="Cancel this leave?" variant="ghost">Cancel</ActionButton>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

async function Approvals({ actor }: { actor: StaffActor }) {
  const rows = await load(() => listLeave(actor, "approvals"));
  if (rows.length === 0) return <EmptyState title="No leave waiting for you" />;
  const who = await names(rows.map((r) => r.userId));
  const canReassign = can(actor, "task.bulk");
  const pool = canReassign
    ? await db().user.findMany({
        where: { AND: [userWhere(actor, scopeOf(actor, "task.bulk")), { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }] },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      })
    : [];
  const withConflicts = await Promise.all(rows.map(async (r) => ({ r, tasks: await load(() => leaveConflicts(actor, r.id)), balance: await load(() => leaveBalanceWarningFor(actor, r.id)) })));
  return (
    <div className="space-y-3">
      {withConflicts.map(({ r, tasks, balance }) => {
        const conflicts: Conflict[] = tasks.map((t) => ({
          id: t.id, title: t.title, client: t.client.name, due: formatDate(t.effectiveDueDate),
          role: t.assignments.filter((a) => a.userId === r.userId).map((a) => a.role).join(", ") || "assigned",
        }));
        return (
          <Card key={r.id} id={r.id}>
            <CardHeader>
              <CardTitle>{who.get(r.userId) ?? "Team member"} · {dates(r)}</CardTitle>
              <span className="text-sm text-muted">{LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType} · {halfDaysLabel(r.halfDays)}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm"><span className="text-muted">Reason:</span> {LEAVE_REASON_LABELS[r.reason] ?? r.reason}{r.note ? ` — ${r.note}` : ""}</p>
              {balance?.message ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{balance.message}</p> : null}
              <LeaveApproval id={r.id} conflicts={conflicts} people={pool.filter((p) => p.id !== r.userId).map((p) => ({ id: p.id, name: p.displayName }))} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

async function Team({ actor, today }: { actor: StaffActor; today: string }) {
  const rows = (await load(() => listLeave(actor, "team"))).filter((r) => r.status === "APPROVED" && r.toDate >= today).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  if (rows.length === 0) return <EmptyState title="No upcoming approved leave in your team" />;
  const who = await names(rows.map((r) => r.userId));
  return (
    <Card>
      <Table>
        <THead><tr><TH>Person</TH><TH>Dates</TH><TH>Type</TH><TH>Days</TH></tr></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-medium">{who.get(r.userId) ?? "—"}{r.fromDate <= today ? <Badge tone="blue" className="ml-2">on leave</Badge> : null}</TD>
              <TD>{dates(r)}</TD>
              <TD>{LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType}</TD>
              <TD className="whitespace-nowrap">{halfDaysLabel(r.halfDays)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
