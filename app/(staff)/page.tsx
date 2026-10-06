import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/server/context";
import { homeData } from "@/server/services/dashboard/service";
import { listTasks } from "@/server/services/tasks/service";
import { db } from "@/server/lib/db";
import { can } from "@/server/permissions/guards";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, monthLabel } from "@/server/lib/dates";
import { formatMinutes } from "@/server/lib/money";
import { DueDate, TaskStatusBadge } from "./tasks/task-bits";
import { SnapshotCard, shortDay } from "./home/bits";

export const metadata = { title: "Home" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const actor = await requireStaff();
  const h = await homeData(actor);
  const canTasks = can(actor, "task.view");
  const logsWork = can(actor, "work.log") && ["PARTNER", "MANAGER", "STAFF", "ARTICLE"].includes(actor.role);
  const isMaker = actor.role === "STAFF" || actor.role === "ARTICLE";
  const hasAssignments = isMaker && canTasks ? (await listTasks(actor, { mine: true, includeClosed: true, take: 1 })).length > 0 : true;

  // The review queue and notices carry ids only; fetch the titles/names to show.
  const [reviewTasks, noticeClients] = await Promise.all([
    h.reviews.length ? db().task.findMany({ where: { id: { in: h.reviews.map((r) => r.taskId) } }, select: { id: true, title: true, client: { select: { name: true } } } }) : [],
    h.noticesDue.length ? db().client.findMany({ where: { id: { in: h.noticesDue.map((n) => n.clientId) } }, select: { id: true, name: true } }) : [],
  ]);
  const reviewTask = new Map(reviewTasks.map((t) => [t.id, t]));
  const clientName = new Map(noticeClients.map((c) => [c.id, c.name]));
  const s = h.snapshot;
  const strip = h.complianceStrip;

  return (
    <div className="space-y-4 pb-16 md:pb-0">
      <PageHeader title={`${greeting()}, ${actor.displayName.split(" ")[0]}`} subtitle={formatDate(h.today)}
        actions={logsWork ? <Link href="/work" className={cn(buttonVariants(), "hidden md:inline-flex")}><Plus className="h-4 w-4" />Add work</Link> : null} />

      {h.missing.banner ? (
        <Alert tone="warn">
          <p className="font-medium">{h.missing.banner}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {h.missing.days.slice(-10).map((d) => <Link key={d} href={`/work?date=${d}`} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs hover:bg-amber-100">{shortDay(d)}</Link>)}
          </p>
        </Alert>
      ) : null}

      {canTasks || logsWork ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {logsWork ? <SnapshotCard label="Today" value={`${formatMinutes(s.todayMinutes)} logged`} href="/work" /> : null}
          {logsWork ? <SnapshotCard label="This week" value={`${formatMinutes(s.weekMinutes)} logged`} href="/work/week" /> : null}
          {canTasks ? (
            <>
              <SnapshotCard label="Overdue" value={s.overdue} href="/tasks?mine=1" className={s.overdue ? "text-st-overdue" : undefined} />
              <SnapshotCard label="Due this week" value={s.dueThisWeek} href="/this-week" />
              <SnapshotCard label="Pending from client" value={s.pendingFromClient} href="/tasks?mine=1&status=PENDING_FROM_CLIENT" className={s.pendingFromClient ? "text-st-pending" : undefined} />
              <SnapshotCard label="Under review" value={s.underReview} href="/tasks?mine=1&status=UNDER_REVIEW" className={s.underReview ? "text-st-review" : undefined} />
            </>
          ) : null}
        </div>
      ) : null}

      {!hasAssignments ? (
        <EmptyState title="Allocations pending">Your Manager has not assigned you any tasks yet. You will see your clients and due dates here once they do. You can still log office or training time from Add work.</EmptyState>
      ) : null}

      {canTasks && hasAssignments ? (
        <Card>
          <CardHeader><CardTitle>Due this week</CardTitle><Link href="/this-week" className="text-xs text-brand hover:underline">Open this week</Link></CardHeader>
          <CardContent className="py-1">
            {h.dueThisWeek.length === 0 ? <p className="py-3 text-sm text-muted">Nothing of yours is overdue or due this week.</p> : (
              <ul className="divide-y divide-line text-sm">
                {h.dueThisWeek.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                      <p className="text-xs text-muted">{t.client.name}{t.periodLabel ? ` · ${t.periodLabel}` : ""}</p>
                    </div>
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <DueDate date={t.effectiveDueDate} status={t.status} today={h.today} provisional={t.isProvisional} holidayShifted={t.holidayShifted} />
                      <TaskStatusBadge status={t.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {h.reviews.length ? (
        <Card>
          <CardHeader><CardTitle>Waiting for your review</CardTitle><Badge tone="violet">{h.reviews.length}</Badge></CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-line text-sm">
              {h.reviews.map((r) => {
                const t = reviewTask.get(r.taskId);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/tasks/${r.taskId}`} className="font-medium hover:underline">{t?.title ?? "Task"}</Link>
                      <p className="text-xs text-muted">{t ? `${t.client.name} · ` : ""}{r.level.toLowerCase()} review</p>
                    </div>
                    <span className="text-xs text-muted">since {formatDateTime(r.submittedAt)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {strip ? (
        <Card>
          <CardHeader><CardTitle>Compliance · {monthLabel(strip.month)}</CardTitle><Link href="/tasks?mine=0" className="text-xs text-brand hover:underline">All tasks</Link></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                { k: "Due this month", v: strip.total, cls: "" },
                { k: "Filed on time", v: strip.filedOnTime, cls: "text-st-filed" },
                { k: "Filed late", v: strip.filedLate, cls: "text-st-late" },
                { k: "Still open", v: strip.open, cls: "text-st-progress" },
                { k: "Overdue", v: strip.overdue, cls: "text-st-overdue" },
              ].map((x) => (
                <div key={x.k}><dt className="text-xs text-muted">{x.k}</dt><dd className={cn("text-xl font-semibold", x.v ? x.cls : "")}>{x.v}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {h.teamMissing.length ? (
          <Card>
            <CardHeader><CardTitle>People with days not logged</CardTitle><span className="text-xs text-muted">{h.teamMissing.length}</span></CardHeader>
            <CardContent className="py-1">
              <ul className="divide-y divide-line text-sm">
                {h.teamMissing.map((p) => (
                  <li key={p.userId} className="py-2">
                    <Link href={`/work/week?user=${p.userId}`} className="font-medium hover:underline">{p.name}</Link>
                    <span className="text-muted"> · {p.days.length} day{p.days.length === 1 ? "" : "s"}</span>
                    <p className="text-xs text-muted">{p.days.slice(-8).map(shortDay).join(", ")}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {strip ? (
          <Card>
            <CardHeader><CardTitle>Allocations pending</CardTitle><span className="text-xs text-muted">{h.allocationsPending.length} open task{h.allocationsPending.length === 1 ? "" : "s"} with nobody assigned</span></CardHeader>
            <CardContent className="py-1">
              {h.allocationsPending.length === 0 ? <p className="py-3 text-sm text-muted">Every open task has someone on it.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {h.allocationsPending.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0"><Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link><p className="text-xs text-muted">{t.client.name}</p></div>
                      <span className="text-xs">{t.effectiveDueDate ? formatDate(t.effectiveDueDate) : "No date"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {h.allocationsPending.length > 8 ? <p className="py-2 text-xs"><Link href="/tasks?mine=0" className="text-brand hover:underline">Assign from the task list (select rows, then Reassign)</Link></p> : null}
            </CardContent>
          </Card>
        ) : null}

        {h.leaveApprovals.length || h.corrections.length ? (
          <Card>
            <CardHeader><CardTitle>Approvals</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {h.leaveApprovals.length ? <p><Link href="/leave" className="font-medium text-brand hover:underline">{h.leaveApprovals.length} leave request{h.leaveApprovals.length === 1 ? "" : "s"}</Link> waiting for you</p> : null}
              {h.corrections.length ? <p><Link href="/work/corrections" className="font-medium text-brand hover:underline">{h.corrections.length} correction request{h.corrections.length === 1 ? "" : "s"}</Link> on locked entries</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {h.dscExpiring.length ? (
          <Card>
            <CardHeader><CardTitle>DSC expiring</CardTitle><Link href="/registers/dsc" className="text-xs text-brand hover:underline">DSC register</Link></CardHeader>
            <CardContent className="py-1">
              <ul className="divide-y divide-line text-sm">
                {h.dscExpiring.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0"><p className="font-medium">{d.holderName}</p><p className="text-xs text-muted">{d.clientNames.filter(Boolean).join(", ")}</p></div>
                    <span className={cn("text-xs", d.state === "EXPIRED" || d.state === "CRITICAL" ? "text-st-overdue" : "text-st-risk")}>
                      {d.state === "EXPIRED" ? `Expired ${formatDate(d.expiryDate)}` : `${formatDate(d.expiryDate)} · ${d.days}d left`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {h.noticesDue.length ? (
          <Card>
            <CardHeader><CardTitle>Notices due soon</CardTitle><Link href="/notices" className="text-xs text-brand hover:underline">All notices</Link></CardHeader>
            <CardContent className="py-1">
              <ul className="divide-y divide-line text-sm">
                {h.noticesDue.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/notices/${n.id}`} className="font-medium hover:underline">{clientName.get(n.clientId) ?? "Notice"}</Link>
                      <p className="text-xs text-muted">{[n.authority.replace("_", " "), n.noticeType, n.section, n.ayOrPeriod].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={cn("text-xs", n.responseDueDate && n.responseDueDate < h.today ? "text-st-overdue" : "text-st-risk")}>Reply by {formatDate(n.responseDueDate)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Quick "Add work" stays in reach on phones. */}
      {logsWork ? (
        <Link href="/work" className={cn(buttonVariants({ size: "lg" }), "fixed bottom-4 right-4 z-30 rounded-full shadow-lg md:hidden")}>
          <Plus className="h-5 w-5" />Add work
        </Link>
      ) : null}
    </div>
  );
}
