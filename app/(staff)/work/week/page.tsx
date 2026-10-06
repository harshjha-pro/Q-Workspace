import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { can, scopeOf } from "@/server/permissions/guards";
import { userWhere } from "@/server/permissions/scopes";
import { addDays, formatDate, formatDateTime, isIsoDate, todayIst } from "@/server/lib/dates";
import { formatMinutes } from "@/server/lib/money";
import { weekGrid } from "@/server/services/work/service";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Week view" };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hrs = (m: number) => (m ? formatMinutes(m) : "");

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ date?: string; user?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "work.log");
  const sp = await searchParams;
  const today = todayIst();
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;
  const userId = sp.user && sp.user !== actor.userId ? sp.user : actor.userId;
  const self = userId === actor.userId;
  if (!self) requireCap(actor, "work.viewOthers");

  const grid = await load(() => weekGrid(actor, userId, date));
  const viewOthers = can(actor, "work.viewOthers");
  const people = viewOthers
    ? await db().user.findMany({
        where: { AND: [userWhere(actor, scopeOf(actor, "work.viewOthers")), { active: true, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }] },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      })
    : [];
  const person = self ? null : (await db().user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? "Team member";

  const weekTotal = grid.days.reduce((s, d) => s + d.total, 0);
  const qs = (d: string) => `/work/week?date=${d}${self ? "" : `&user=${userId}`}`;
  const sunday = grid.days[6]!.date;

  return (
    <div className="space-y-4">
      <PageHeader
        title={self ? "My week" : `${person}'s week`}
        subtitle={`${formatDate(grid.weekStart)} to ${formatDate(sunday)} · ${weekTotal ? `${formatMinutes(weekTotal)} logged` : "Nothing logged"}`}
        actions={self ? <Link href="/work" className={buttonVariants({ size: "sm" })}>Add work</Link> : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={qs(addDays(grid.weekStart, -7))} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label="Previous week"><ChevronLeft className="h-4 w-4" aria-hidden /> Prev</Link>
          <Link href={qs(today)} className={buttonVariants({ variant: "ghost", size: "sm" })}>This week</Link>
          <Link href={qs(addDays(grid.weekStart, 7))} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label="Next week">Next <ChevronRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        {grid.locked ? (
          <Badge tone="amber" className="gap-1"><Lock className="h-3 w-3" aria-hidden /> Locked {formatDateTime(grid.lockAt)}{self ? " — request a correction to change" : ""}</Badge>
        ) : (
          <span className="text-xs text-muted">Open — locks {formatDateTime(grid.lockAt)}</span>
        )}
      </div>

      {viewOthers && people.length > 0 ? (
        <form method="get" action="/work/week" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="date" value={grid.weekStart} />
          <Select name="user" defaultValue={userId} aria-label="Team member" className="max-w-64">
            <option value={actor.userId}>Me</option>
            {people.filter((p) => p.id !== actor.userId).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </Select>
          <Button type="submit" size="sm" variant="secondary">View</Button>
        </form>
      ) : null}

      {grid.rows.length === 0 && weekTotal === 0 ? (
        <EmptyState title="No work logged this week">
          {self ? <Link href="/work" className="text-brand underline">Add work</Link> : null}
        </EmptyState>
      ) : null}

      <Card className="overflow-hidden">
        <Table className="min-w-[44rem]">
          <THead>
            <tr>
              <TH className="sticky left-0 z-10 min-w-40 bg-gray-50">Client / work</TH>
              {grid.days.map((d, i) => (
                <TH key={d.date} className={cn("text-right normal-case", d.date === today && "text-brand")}>
                  <span className="block uppercase">{DOW[i]}</span>
                  <span className="block font-normal">{d.date.slice(8)}-{formatDate(d.date).slice(3, 6)}</span>
                  {d.holiday ? <Badge tone="violet" className="mt-0.5" title={d.holiday}>Holiday</Badge> : null}
                  {d.leave ? <Badge tone="blue" className="mt-0.5">{d.leave >= 2 ? "Leave" : "½ leave"}</Badge> : null}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {grid.rows.map((r, ri) => (
              <TR key={ri}>
                <TD className="sticky left-0 z-10 bg-surface">
                  <span className="block font-medium">{r.label}</span>
                  {r.sub ? <span className="block text-xs text-muted">{r.sub}</span> : null}
                </TD>
                {r.minutes.map((m, i) => (
                  <TD key={i} className="text-right tabular-nums">
                    {m && self ? <Link href={`/work?date=${grid.days[i]!.date}`} className="hover:underline">{hrs(m)}</Link> : hrs(m)}
                  </TD>
                ))}
              </TR>
            ))}
            <TR className="bg-gray-50 font-semibold">
              <TD className="sticky left-0 z-10 bg-gray-50">Day total</TD>
              {grid.days.map((d) => (
                <TD key={d.date} className="text-right tabular-nums">
                  {d.total ? hrs(d.total) : self && d.date <= today && !grid.locked ? <Link href={`/work?date=${d.date}`} className="font-normal text-brand hover:underline">Add</Link> : <span className="font-normal text-muted">—</span>}
                </TD>
              ))}
            </TR>
          </TBody>
        </Table>
      </Card>
      <p className="text-xs text-muted">Hours are shown as logged effort only. Holidays and approved leave are marked in the header.</p>
    </div>
  );
}
